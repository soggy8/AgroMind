# Economics Backend (module 5.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate `economics` backend module that turns the Simulator's 25-weather-year results into money: the climate bill, bad-year money, a who-earns-most grid, and the farmer's own numbers, served at `/api/farms/{farm_id}/economics`.

**Architecture:** `ports.py` is the only file that imports `app.modules.simulator.service`. It calls `run_simulation` and turns the result into plain dataclasses. `money.py` is pure numpy maths. `sentences.py` writes rule-generated text. `service.py` runs the Simulator several times (today, the scenario, the other heat response, one run per grid row) and assembles the report. `router.py` is HTTP only. No database tables.

**Tech Stack:** Python 3.11+, FastAPI, pydantic 2, numpy, pytest; TypeScript types only (`npm run build`).

**Spec:** `docs/modules/economics.md`. Read it first; section numbers below refer to it.

## Global Constraints

- Only `backend/app/modules/economics/ports.py` imports the Simulator, and only `app.modules.simulator.service` (as `from app.modules.simulator import service as simulator`). Nothing in `simulator/`, `croptwin/`, `cropdoctor/` or `shared/` changes.
- `money.py` and `sentences.py` import only the standard library, numpy and `.parameters` (`sentences.py` may also import `money.SwitchPoints`). No FastAPI, pydantic, database or network.
- `schemas.py` and `frontend/src/modules/economics/types.ts` are one contract. Change both in the same commit.
- Every number carries a kind, one of `"observed" | "modelled" | "scenario"`, plus a source. Results are modelled, money inputs are scenario (source: USDA/ISU table, `ASSUMPTION`, or `Your number`), and field area is observed (CropTwin).
- API numbers are metric (USD/ha, USD/t, USD/ha/year). `units` (`"metric" | "us"`) only changes sentences.
- Margins are never called a prediction. The sentences lead with change versus today and differences between rotations.
- Commit messages start with `Economics:` and carry **no** Claude attribution lines (`CLAUDE.md`).
- Checks: `cd backend && .venv/bin/python -m pytest`; `cd frontend && npm run build`.

## Review Focus

1. **Field with no known current crop** (`current_crop_id = None`): the first season gets the normal "after a different crop" cost. Test in Task 1.
2. **Farmer numbers for an unpriced crop** (`prices_usd_t={"wheat": ...}`, or `price_crop="sunflower"`): 422 with a plain message, never silently ignored. Test in Task 5.
3. **A scenario that helps** (`temp_delta_c=-1`): the bill is positive, the sentence says "more", and there's no win-back share. Test in Task 4.
4. **Only one priced rotation** (the others contain wheat or sunflower): 200, `who_earns_most = null`, `best_alternative = null`, and the others are listed in `excluded_rotations`. Test in Task 5.
5. **NASA projection scenario**: grid rows use the projection's May–Sep median rain change, and `your_cell` uses its median temperature change with `exact = false`. Test in Task 5.

---

### Task 0: Branch and a green baseline

**Files:** none.

- [ ] **Step 1: Branch**

Run: `cd /home/kiril/AgroMind && git switch -c economics`
Expected: `Switched to a new branch 'economics'`

- [ ] **Step 2: Reinstall the backend dependencies** (the venv is missing `anthropic`, so 27 tests error out before they run)

Run: `cd backend && .venv/bin/pip install -e ".[dev]"`
Expected: ends with `Successfully installed ...` including `anthropic`

- [ ] **Step 3: Baseline**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass, 0 errors. If anything fails, stop and report it; it isn't this plan's to fix.

---

### Task 1: Parameters and pure money maths

**Files:**
- Create: `backend/app/modules/economics/__init__.py` (docstring only)
- Create: `backend/app/modules/economics/parameters.py`
- Create: `backend/app/modules/economics/money.py`
- Test: `backend/tests/economics/__init__.py`, `backend/tests/economics/test_money.py`

**Interfaces:**
- Produces (`parameters.py`, data only, every value with a source string; values and sources from spec §9):
  - `ACRES_PER_HA = 2.4710538`, `per_acre_to_per_ha(usd_per_acre: float) -> float`, `bu_ac_to_t_ha(bu_per_acre: float, lb_per_bu: float) -> float`, `usd_per_bu_to_usd_per_t(usd_per_bu: float, lb_per_bu: float) -> float` (same formulas as `simulator/parameters.py`)
  - `@dataclass(frozen=True) class CropMoney: crop_id: str; name: str; price_usd_t: float; typical_yield_t_ha: float; cost_before_rent_usd_ha: float; cost_after_self_before_rent_usd_ha: float | None; sources: dict[str, str]  # keys "price", "yield", "cost"; display: dict[str, str]  # keys "price" ("$4.60/bu"), "yield" ("211 bu/ac"), "cost" ("$637.98/ac")`
  - `CROP_MONEY: dict[str, CropMoney]` with keys exactly `"maize"`, `"soybean"`, `"oats"` (Simulator crop ids). Names: `"Maize"`, `"Soybean"`, `"Oats"`.
  - `ISU_TOTAL_COST_USD_AC = {"maize": 911.98, "maize_after_maize": 960.02, "soybean": 679.11, "oats": 465.0}`, used by the test only
  - `RENT_USD_HA = per_acre_to_per_ha(274.0)`, `RENT_SOURCE`, `RENT_DISPLAY = "$274/ac"`
  - `IRRIGATION_USD_PER_MM_HA = 0.50`, `IRRIGATION_SOURCE` (starts `"ASSUME:"`); `COVER_CROP_USD_HA = per_acre_to_per_ha(35.0)`, `COVER_CROP_SOURCE` (starts `"ASSUME:"`)
  - `NEAR_TIE_USD_HA = 45.0`, `NEAR_TIE_SOURCE = "ASSUME: the Simulator's 0.03 near-tie on its $1,500/ha margin scale"`
  - `DEFAULT_YOURS_CROPS = ("maize", "soybean")`, `DEFAULT_YOURS_SOURCE = "ASSUME: maize-soybean is the usual central-Iowa rotation"`
  - `DEFAULT_WARMING_C = (0.0, 1.0, 2.0, 3.0, 4.0)`, `DEFAULT_PRICE_STEPS_PCT = (-30.0, -15.0, 0.0, 15.0, 30.0)`
- Produces (`money.py`):
  - `@dataclass(frozen=True) class MoneyInputs: price_usd_t: dict[str, float]; typical_yield_t_ha: dict[str, float]; cost_before_rent_usd_ha: dict[str, float]; cost_after_self_before_rent_usd_ha: dict[str, float]; rent_usd_ha: float; irrigation_usd_per_mm_ha: float; cover_crop_usd_ha: float`
  - `@dataclass(frozen=True) class P3: p10: float; p50: float; p90: float`
  - `season_margins(crops: Sequence[str], first_predecessor: str | None, track_yields: np.ndarray, irrigation_mm: Sequence[float], cover_crop: bool, m: MoneyInputs, price_change_pct: float = 0.0, price_crop: str | None = None) -> np.ndarray`. `track_yields` and the result have shape `(n_seasons, n_tracks)`. Formula in spec §6.2. A crop following itself uses `cost_after_self_before_rent_usd_ha` when the crop has one.
  - `annual_margins(season_margins: np.ndarray, years: int) -> np.ndarray`, shape `(n_tracks,)` = column sum / years
  - `p3(values: np.ndarray) -> P3` (`np.percentile` 10/50/90, no rounding)
  - `cash_cushion(season_margins: np.ndarray) -> np.ndarray`, shape `(n_tracks,)` = `max(0, -min(cumsum over seasons))`
  - `losing_season_share(season_margins: np.ndarray) -> float`; `losing_runs(season_margins: np.ndarray) -> int` (tracks whose column sum < 0)
  - `grid_winner(p50_by_rotation: dict[str, float], near_tie_usd_ha: float) -> tuple[str | None, bool]`. Returns `(winner, near_tie)`; a single rotation always wins.
  - `@dataclass(frozen=True) class SwitchPoints: origin_winner: str | None; warming_switch: tuple[float, float] | None; price_switch: tuple[float, float] | None; wins_everywhere: bool`
  - `switch_points(winners: list[list[str | None]], warming_c: Sequence[float], price_pct: Sequence[float], yours: str) -> SwitchPoints` (algorithm below)

- [ ] **Step 1: Write the failing tests** in `backend/tests/economics/test_money.py`

```python
import numpy as np
from dataclasses import replace
from app.modules.economics import money, parameters as p

M = money.MoneyInputs(
    price_usd_t={"maize": 100.0, "soybean": 200.0}, typical_yield_t_ha={"maize": 10.0, "soybean": 3.0},
    cost_before_rent_usd_ha={"maize": 500.0, "soybean": 300.0}, cost_after_self_before_rent_usd_ha={"maize": 550.0},
    rent_usd_ha=100.0, irrigation_usd_per_mm_ha=1.0, cover_crop_usd_ha=50.0)
Y = np.array([[1.0, 0.5], [1.0, 1.0], [1.0, 1.0]])  # seasons x tracks

def test_season_margins_predecessor_irrigation_cover():
    m = money.season_margins(["maize", "maize", "soybean"], "soybean", Y, [0, 10, 0], True, M)
    assert m.tolist() == [[350, -150], [290, 290], [150, 150]]

def test_unknown_first_predecessor_uses_normal_cost():
    m = money.season_margins(["maize"], None, Y[:1], [0], False, M)
    assert m.tolist() == [[400, -100]]

def test_first_season_after_same_crop_uses_after_self_cost():
    assert money.season_margins(["maize"], "maize", Y[:1], [0], False, M).tolist() == [[350, -150]]

def test_own_land_and_one_crop_price_shift():
    own = replace(M, rent_usd_ha=0.0)
    m = money.season_margins(["maize", "soybean"], "soybean", Y[:2], [0, 0], False, own, price_change_pct=10, price_crop="soybean")
    assert m.tolist() == [[500, 0], [360, 360]]  # soybean revenue 660 - 300

def test_all_prices_shift():
    m = money.season_margins(["maize"], "soybean", Y[:1], [0], False, M, price_change_pct=-10)
    assert m.tolist() == [[300, -150]]

def test_annual_cushion_losing():
    m = np.array([[350.0, -150.0], [290.0, -200.0], [150.0, 150.0]])
    assert np.allclose(money.annual_margins(m, 3), [790 / 3, -200 / 3])
    assert money.cash_cushion(m).tolist() == [0.0, 350.0]
    assert money.losing_season_share(m) == 2 / 6 and money.losing_runs(m) == 1

def test_p3():
    r = money.p3(np.arange(11.0))
    assert (r.p10, r.p50, r.p90) == (1.0, 5.0, 9.0)

def test_grid_winner_and_near_tie():
    assert money.grid_winner({"A": 300.0, "B": 200.0}, 45) == ("A", False)
    assert money.grid_winner({"A": 300.0, "B": 260.0}, 45) == (None, True)
    assert money.grid_winner({"A": -5.0}, 45) == ("A", False)

W, P = [0.0, 1.0, 2.0, 3.0], [-30.0, -15.0, 0.0, 15.0]

def test_switch_points_both_axes_and_ties_skipped():
    g = [["B", "A", "A", "A"], ["B", "A", None, "A"], ["B", "B", "B", "A"], ["B", "B", "B", "B"]]
    sp = money.switch_points(g, W, P, "A")
    assert sp == money.SwitchPoints("A", (1.0, 2.0), (-15.0, -30.0), False)

def test_switch_points_other_wins_at_origin_and_everywhere():
    assert money.switch_points([["B"] * 4] * 4, W, P, "A").origin_winner == "B"
    sp = money.switch_points([["A"] * 4] * 4, W, P, "A")
    assert sp.wins_everywhere and sp.warming_switch is None and sp.price_switch is None

def test_parameters_match_isu_totals_and_sources():
    for crop, total in [("maize", 911.98), ("soybean", 679.11), ("oats", 465.0)]:
        assert abs(p.CROP_MONEY[crop].cost_before_rent_usd_ha + p.RENT_USD_HA - p.per_acre_to_per_ha(total)) < 1e-6
    after = p.CROP_MONEY["maize"].cost_after_self_before_rent_usd_ha
    assert abs(after + p.RENT_USD_HA - p.per_acre_to_per_ha(960.02)) < 1e-6
    assert p.CROP_MONEY["oats"].sources["cost"].startswith("ASSUME")
    assert all(set(c.sources) == {"price", "yield", "cost"} for c in p.CROP_MONEY.values())
```

- [ ] **Step 2: Run to see them fail**

Run: `cd backend && .venv/bin/python -m pytest tests/economics/test_money.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.modules.economics'`

- [ ] **Step 3: Write `parameters.py`** with the values and sources in spec §9. Copy the source wording from `simulator/parameters.py` (`_WASDE`, `_ISU_COST`, the yield sources, `IRRIGATION_COST_SOURCE`, `COVER_CROP_SOURCES["cost"]`). Store costs per hectare.

- [ ] **Step 4: Write `money.py`**, using the signatures above. `switch_points`:

```
r0 = index of warming_c nearest 0;  c0 = index of price_pct nearest 0
origin_winner = winners[r0][c0]
wins_everywhere = every cell == yours
if origin_winner != yours: warming_switch = price_switch = None
else:
  warming_switch: for r in r0+1 .. end: w = winners[r][c0]; if w not in (None, yours): (warming_c[r-1], warming_c[r]); stop
  price_switch:   for c in c0-1 down to 0: w = winners[r0][c]; if w not in (None, yours): (price_pct[c+1], price_pct[c]); stop
```

- [ ] **Step 5: Run to see them pass**

Run: `.venv/bin/python -m pytest tests/economics/test_money.py -q`
Expected: 11 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/economics backend/tests/economics
git commit -m "Economics: parameters with sources and pure money maths"
```

---

### Task 2: API contract (pydantic + TypeScript)

**Files:**
- Create: `backend/app/modules/economics/schemas.py`
- Create: `frontend/src/modules/economics/types.ts`
- Test: `backend/tests/economics/test_schemas.py`

**Interfaces:**
- Produces (`schemas.py`; module docstring says `types.ts` mirrors it by hand). Field names are exact:
  - `Kind = Literal["observed", "modelled", "scenario"]`, `Units = Literal["metric", "us"]`, `IrrigationMode = Literal["none", "limited", "full"]`, `HeatResponse = Literal["published", "local"]`, `Land = Literal["rent", "own"]`, `MAX_ROTATIONS = 4`
  - Inputs:
    - `EconScenario`: `temp_delta_c` (0, −1..5), `rain_change_pct` (0, −50..30), `irrigation` ("none"), `irrigation_cap_mm` (None, 0..1000, required when "limited"), `years` (5, 1..10), `projection` (None, pattern `^ssp\d{3}_\d{4}s$`), `heat_response` ("published"). The same limits and validator as the Simulator's `Scenario`, without `price_change_pct`.
    - `RotationInput`: `id`, `name`, `crops` (1..6), `cover_crop=False`.
    - `YourNumbers`: `land: Land = "rent"`, `rent_usd_ha: float | None` (≥0), `prices_usd_t: dict[str, float] = {}` (each >0), `costs_before_rent_usd_ha: dict[str, float] = {}` (each ≥0), `irrigation_usd_per_mm_ha: float | None` (≥0), `cover_crop_usd_ha: float | None` (≥0).
    - `GridSpec`: `warming_c: list[float]` (default `DEFAULT_WARMING_C`, 2..7 unique values in −1..5, sorted ascending by the validator), `price_change_pct: list[float]` (default `DEFAULT_PRICE_STEPS_PCT`, 2..9 unique values in −40..40, sorted).
    - `EconomicsRequest`: `field_id`, `rotations: list[RotationInput] | None` (1..`MAX_ROTATIONS`, ids unique), `scenario: EconScenario`, `price_change_pct` (0, −40..40), `price_crop: str | None`, `your_numbers: YourNumbers`, `grid: GridSpec`, `units: Units = "metric"`.
  - Outputs:
    - `Stat(p10, p50, p90: float; unit: str)`
    - `MoneyInput(id: str; label: str; value: float; unit: str; display: str; kind: Kind = "scenario"; source: str)`. Ids are `price.<crop>`, `yield.<crop>`, `cost.<crop>`, `cost_after_self.maize`, `rent`, `irrigation`, `cover_crop`.
    - `Area(value_ha: float; kind: Kind = "observed"; source: str)`
    - `BestAlternative(rotation_id, name, scenario_margin: Stat, wins_back_usd_ha: float, wins_back_share: float | None)`
    - `ClimateBill(kind: Kind = "modelled", rotation_id, name, today: Stat, scenario: Stat, change: Stat, change_whole_field: Stat, other_heat_response: HeatResponse, other_heat_response_change_usd_ha: float, best_alternative: BestAlternative | None, sentence: str, sources: list[str])`
    - `BadYears(kind: Kind = "modelled", rotation_id, name, annual_margin: Stat, season_margin: Stat, seasons_total: int, losing_season_share: float, losing_runs: int, runs: int, worst_season_usd_ha: float, cash_cushion_worst_usd_ha: float, cash_cushion_typical_usd_ha: float, sentence: str)`
    - `GridCell(winner_rotation_id: str | None, near_tie: bool, margin_p50_usd_ha: dict[str, float])`, `YourCell(row: int, col: int, exact: bool)`
    - `WhoEarnsMost(kind: Kind = "modelled", warming_c: list[float], price_change_pct: list[float], price_crop: str | None, rain_change_pct: float, rain_change_source: str, cells: list[list[GridCell]], your_cell: YourCell, sentence: str)`. `cells[row][col]`, with rows = warming.
    - `ExcludedRotation(rotation_id, reason)`, `Assumption(topic, text, source)`
    - `EconomicsReport(kind: Kind = "modelled", farm_id, field_id, field_name, area: Area, scenario: EconScenario, scenario_kind: Kind = "scenario", scenario_label: str, price_change_pct: float, price_crop: str | None, units: Units, yours_rotation_id: str, yours_assumed: bool, climate_bill: ClimateBill, bad_years: list[BadYears], who_earns_most: WhoEarnsMost | None, inputs_used: list[MoneyInput], excluded_rotations: list[ExcludedRotation], assumptions: list[Assumption], notes: list[str], calibrated: bool, ensemble_size: int, ensemble_start_years: list[int], data_note: str, simulator_model_version: str, currency: str = "USD")`
    - `EconomicsDefaults(kind: Kind = "scenario", inputs: list[MoneyInput], suggested_rotations: list[RotationInput], default_yours_rotation_id: str, grid: GridSpec, currency: str = "USD")`
- Produces (`types.ts`): one exported type or interface per model above, with identical field names, in the style of `frontend/src/modules/simulator/types.ts` (first line: `// Mirrors backend/app/modules/economics/schemas.py. Change both together.`). Use `| null` for optional fields.

- [ ] **Step 1: Write the failing tests** in `backend/tests/economics/test_schemas.py`

```python
import pytest
from pydantic import ValidationError
from app.modules.economics.schemas import EconomicsRequest, GridSpec

def test_defaults():
    r = EconomicsRequest(field_id="north")
    assert r.rotations is None and r.units == "metric" and r.your_numbers.land == "rent"
    assert r.grid.warming_c == [0, 1, 2, 3, 4] and r.grid.price_change_pct == [-30, -15, 0, 15, 30]

def test_duplicate_rotation_ids_rejected():
    rot = {"id": "A", "name": "x", "crops": ["maize"]}
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", rotations=[rot, rot])

def test_grid_sorted_and_limited():
    assert GridSpec(warming_c=[2, 0, 1]).warming_c == [0, 1, 2]
    for bad in ([1], [0, 0], [0, 6], list(range(8))):
        with pytest.raises(ValidationError):
            GridSpec(warming_c=bad)
    with pytest.raises(ValidationError):
        GridSpec(price_change_pct=[0, 50])

def test_limited_irrigation_needs_cap_and_prices_positive():
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", scenario={"irrigation": "limited"})
    with pytest.raises(ValidationError):
        EconomicsRequest(field_id="north", your_numbers={"prices_usd_t": {"maize": 0}})
```

- [ ] **Step 2: Run to see them fail**

Run: `.venv/bin/python -m pytest tests/economics/test_schemas.py -q`
Expected: FAIL, `ModuleNotFoundError ... economics.schemas`

- [ ] **Step 3: Write `schemas.py` and `types.ts`** following the Interfaces block.

- [ ] **Step 4: Run the checks**

Run: `.venv/bin/python -m pytest tests/economics -q && cd ../frontend && npm run build`
Expected: 15 passed; the build finishes with no type errors

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/economics/schemas.py backend/tests/economics/test_schemas.py frontend/src/modules/economics/types.ts
git commit -m "Economics: API contract (schemas.py and types.ts)"
```

---

### Task 3: Port to the Simulator

**Files:**
- Create: `backend/app/modules/economics/ports.py`
- Test: `backend/tests/economics/conftest.py`, `backend/tests/economics/test_ports.py`

**Interfaces:**
- Consumes: `simulator.get_options(session, farm_id) -> SimulatorOptions` (`.fields[i]` has `id, name, crop_id, area_ha`; `.suggested_rotations`; `.projections[i]` has `id, period, ssp_name, temp_change_c["median"], rain_change_pct["median"]`); `simulator.run_simulation(session, farm_id, simulator.SimulationRequest(...)) -> SimulationResult` (`.rotations[i]` has `rotation_id, seasons[j].crop_id, seasons[j].irrigation_mm.p50, track_seasons ([track][season]), economics.margin_per_ha`; and `.calibrated, .ensemble_start_years, .data_note, .model_version, .projection`); errors `simulator.NotFound`, `simulator.InvalidRotation`, `simulator.WeatherUnavailable`. Task 2's `EconScenario` and `RotationInput`.
- Produces:
  - `class NotFound(Exception)`, `class InvalidRequest(Exception)`, `class WeatherUnavailable(Exception)`
  - `@dataclass(frozen=True) class FieldInfo: field_id: str; name: str; area_ha: float; current_crop_id: str | None`
  - `@dataclass(frozen=True) class ProjectionDelta: id: str; label: str; temp_change_c: float; rain_change_pct: float`. `label = f"NASA {period}, {ssp_name}"`, and the two values are the May–Sep medians.
  - `@dataclass(frozen=True) class RotationRun: rotation_id: str; season_crops: tuple[str, ...]; track_yields: np.ndarray  # (seasons, tracks); irrigation_mm_p50: tuple[float, ...]; simulator_margin: tuple[float, float, float] | None  # Simulator's margin_per_ha p10/p50/p90, only when include_economics`
  - `@dataclass(frozen=True) class Run: rotations: dict[str, RotationRun]; calibrated: bool; ensemble_start_years: list[int]; data_note: str; model_version: str`
  - `field_info(session, farm_id: str, field_id: str) -> FieldInfo` (`NotFound` for an unknown field)
  - `suggested_rotations(session, farm_id: str) -> list[RotationInput]` (economics `RotationInput`)
  - `projection(session, farm_id: str, projection_id: str) -> ProjectionDelta` (`InvalidRequest` if absent)
  - `run(session, farm_id: str, field_id: str, rotations: list[RotationInput], scenario: EconScenario, include_economics: bool = False) -> Run`. Builds `simulator.SimulationRequest(field_id=..., rotations=..., scenario=simulator.Scenario(**scenario.model_dump(), price_change_pct=0), include_economics=...)`, then maps the Simulator's three errors to this module's three.

- [ ] **Step 1: Write the failing tests**

`backend/tests/economics/conftest.py`: an `api` fixture identical to `tests/simulator/conftest.py::api` (seeds CropTwin's demo farm), plus `db` returning the seeded `db_session`.

`backend/tests/economics/test_ports.py`:

```python
import pytest
from app.modules.economics import ports
from app.modules.economics.schemas import EconScenario, RotationInput

def test_field_info_and_suggestions(db):
    f = ports.field_info(db, "demo", "north")
    assert f.field_id == "north" and f.area_ha > 0
    assert [r.id for r in ports.suggested_rotations(db, "demo")] == ["A", "B", "C"]

def test_run_shapes(db):
    rots = [RotationInput(id="B", name="Maize → Soybean", crops=["maize", "soybean"])]
    run = ports.run(db, "demo", "north", rots, EconScenario(years=5), include_economics=True)
    b = run.rotations["B"]
    assert b.track_yields.shape == (len(b.season_crops), 25) and len(run.ensemble_start_years) == 25
    assert b.simulator_margin is not None and len(b.irrigation_mm_p50) == len(b.season_crops)

def test_errors_are_mapped(db):
    with pytest.raises(ports.NotFound):
        ports.field_info(db, "demo", "nope")
    with pytest.raises(ports.InvalidRequest):
        ports.projection(db, "demo", "ssp999_2990s")
```

- [ ] **Step 2: Run to see them fail**

Run: `.venv/bin/python -m pytest tests/economics/test_ports.py -q`
Expected: FAIL, `ImportError ... ports`

- [ ] **Step 3: Write `ports.py`** following the Interfaces block. `track_yields = np.asarray(track_seasons, dtype=float).T`.

- [ ] **Step 4: Run to see them pass**

Run: `.venv/bin/python -m pytest tests/economics -q`
Expected: 18 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/economics/ports.py backend/tests/economics/conftest.py backend/tests/economics/test_ports.py
git commit -m "Economics: port to the Simulator's public service"
```

---

### Task 4: Sentences

**Files:**
- Create: `backend/app/modules/economics/sentences.py`
- Test: `backend/tests/economics/test_sentences.py`

**Interfaces:**
- Consumes: `parameters.ACRES_PER_HA`, `money.SwitchPoints`.
- Produces (the exact copy is fixed here; values are formatted with `money()`):
  - `money(usd_ha: float, units: str) -> str` → metric `f"${round(abs(v)):,}/ha"`, us `f"${round(abs(v) / ACRES_PER_HA):,}/ac"`
  - `scenario_label(temp_delta_c: float, rain_change_pct: float, projection_label: str | None) -> str` → `projection_label` if given, else `f"{t:+g} °C, {r:+g}% rain"`
  - `climate_bill(yours: str, label: str, change_p50: float, alt: str | None, wins_back: float | None, share: float | None, units: str) -> str`:
    - `|change| < 0.5`: `f"In this scenario ({label}), {yours} earns about the same as in today's climate."`
    - `change < 0`: `f"In this scenario ({label}), {yours} earns about {money} a year less than in today's climate."` then:
      - `share` ≤ 1: `f" Switching to {alt} wins back about {money(wins_back)} of that ({share:.0%})."`
      - `share` > 1: `f" Switching to {alt} more than makes up for it."`
      - no alt, or `wins_back` ≤ 0: `" None of the other rotations earns more in this scenario."`
    - `change > 0`: `"... earns about {money} a year more than in today's climate."`, plus `f" {alt} would earn about {money(wins_back)} a year more still."` when `wins_back` > 0
  - `bad_years(name: str, losing_share: float, worst: float, cushion_worst: float, units: str) -> str`:
    - `losing_share == 0`: `f"{name} made money in every simulated season."`
    - otherwise: `f"{name} loses money in about {max(1, round(losing_share * 10))} of every 10 seasons; the worst season loses {money(worst)}."`, plus `f" Getting through the worst run of seasons takes about {money(cushion_worst)} in cash."` when `cushion_worst` > 0
  - `switch(sp: SwitchPoints, names: dict[str, str], yours: str) -> str` (a warming pair `(a, b)` reads `f"between {a:+g} °C and {b:+g} °C"`; a price pair `(x, y)` reads `f"between {abs(x):g}% and {abs(y):g}%"`, using `abs` so a 0 never prints as "-0"):
    - origin is a near tie: `f"In today's climate at today's prices, {Y} and the next rotation are too close to call."`
    - origin won by another: `f"Even in today's climate at today's prices, {Other} earns more than {Y}."`
    - both switches: `f"{Y} stops earning most {warming} at today's prices, or when prices fall {price}."`
    - warming only: `f"{Y} stops earning most {warming} at today's prices."`
    - price only: `f"In today's climate, {Y} stops earning most when prices fall {price}."`
    - wins everywhere: `f"{Y} earns most everywhere on this grid."`
    - otherwise: `f"{Y} earns most at today's prices and climate; other rotations win elsewhere on the grid."`
  - Constants:
    - `CAVEAT = "Compare rotations rather than reading single numbers: the model's year-to-year skill is weak, so these are scenario margins, not forecasts."`
    - `NOT_CALIBRATED = "This field is outside the area the yield model was calibrated for, so treat the money figures as rough."`
    - `OWN_LAND = "You own the land, so margin here is what's left to pay for the land and your management."`
    - `RENT_LAND = "Costs include cash rent and labour, so margin is the return to management."`

- [ ] **Step 1: Write the failing tests** in `backend/tests/economics/test_sentences.py`. Cover:
  - `money(190, "metric") == "$190/ha"` and `money(190, "us") == "$77/ac"`
  - a negative bill with a 37% win-back (the exact sentence with "a year less" and "(37%)")
  - **a scenario that helps** (`change_p50=+40`, the alt doesn't beat it): the sentence contains "a year more" and no "%"
  - share > 1 ("more than makes up for it")
  - `bad_years` with 0 losing seasons, and with 0.36 → "about 4 of every 10 seasons"
  - each of the seven `switch` cases, with `names={"A": "Maize → Soybean", "B": "Maize → Soybean → Oats"}`, e.g. `SwitchPoints("A", (1.0, 2.0), (-15.0, -30.0), False)` → `"Maize → Soybean stops earning most between +1 °C and +2 °C at today's prices, or when prices fall between 15% and 30%."`

- [ ] **Step 2: Run to see them fail**

Run: `.venv/bin/python -m pytest tests/economics/test_sentences.py -q`
Expected: FAIL, `ImportError ... sentences`

- [ ] **Step 3: Write `sentences.py`** following the Interfaces block.

- [ ] **Step 4: Run to see them pass**

Run: `.venv/bin/python -m pytest tests/economics -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/economics/sentences.py backend/tests/economics/test_sentences.py
git commit -m "Economics: rule-generated sentences"
```

---

### Task 5: Service (assemble the report)

**Files:**
- Create: `backend/app/modules/economics/service.py`
- Test: `backend/tests/economics/test_service.py`

**Interfaces:**
- Consumes: Tasks 1–4 as declared.
- Produces:
  - `NotFound = ports.NotFound`, `InvalidRequest = ports.InvalidRequest`, `WeatherUnavailable = ports.WeatherUnavailable` (re-exported for the router)
  - `get_defaults(session, farm_id: str, *, port=ports) -> EconomicsDefaults`. `default_yours_rotation_id` is the suggested rotation whose crops equal `DEFAULT_YOURS_CROPS` (Simulator id `"B"`).
  - `build_report(session, farm_id: str, req: EconomicsRequest, *, port=ports) -> EconomicsReport`
  - `resolve_inputs(your: YourNumbers) -> tuple[MoneyInputs, list[MoneyInput]]`. Raises `InvalidRequest` for any crop id in `prices_usd_t` / `costs_before_rent_usd_ha` that isn't in `CROP_MONEY`. With `land="own"`, rent is 0 and the `rent` input says `"Your number"` with display `"own land"`. Overridden values have source `"Your number"`.

`build_report` steps (spec §6):
1. `rotations = req.rotations` or the suggested rotations reordered so the `DEFAULT_YOURS_CROPS` one is first (`yours_assumed = True`). `yours = rotations[0]`.
2. Split priced and unpriced (every crop in `CROP_MONEY`). If yours is unpriced, raise `InvalidRequest(f"{yours.name} includes {crop names}, which have no Iowa price and cost data, so it can't be priced.")`. Otherwise each unpriced rotation becomes an `ExcludedRotation` with the reason `f"{crop names} have no Iowa price and cost data."`. If `price_crop` is set and not in `CROP_MONEY`, raise `InvalidRequest`.
3. Runs, all with the priced rotations:
   - `today`: `scenario.model_copy(update={"temp_delta_c": 0, "rain_change_pct": 0, "projection": None})`
   - `scenario`: as requested
   - `other`: `heat_response` flipped
   - one run per `grid.warming_c` value `w`: `{"temp_delta_c": w, "rain_change_pct": grid_rain, "projection": None}`. `grid_rain` is the scenario's `rain_change_pct`, or `port.projection(...).rain_change_pct` when a projection is set, clipped to −50..30. Its `rain_change_source` is `"the scenario's rain change"` or `"the projection's May-Sep median rain change"`.
4. Money via `money.season_margins` with `first_predecessor = field.current_crop_id`. Then:
   - Climate bill (yours) and best alternative: spec §6.4.
   - `change_whole_field` = `change` × `area_ha`, unit `"USD/year"`.
   - Bad years for every priced rotation, from the scenario run.
   - The grid only when there are ≥2 priced rotations: each column re-applies `price_change_pct=col` (with `price_crop`) to that row's run, then `money.grid_winner(p50s, NEAR_TIE_USD_HA)`. `your_cell` = the nearest row to the scenario's warming (`temp_delta_c`, or the projection's `temp_change_c`) and the nearest column to `req.price_change_pct`. `exact` is true only when both match exactly.
5. Round money to 0 decimals in `Stat`s and fields, and shares to 3. `notes` = `[CAVEAT, RENT_LAND or OWN_LAND]` + `[NOT_CALIBRATED]` when the field isn't calibrated + the Simulator's `data_note` when it's non-empty.
6. `assumptions`: one entry, with the source from `parameters`, for each of these that applies:
   - oats cost, when oats is in a rotation
   - irrigation cost and the season-p50 irrigation approximation (spec §6.6), when `irrigation != "none"`
   - cover-crop cost, when any rotation has one
   - near tie, when there's a grid
   - default yours, when `yours_assumed`

- [ ] **Step 1: Write the failing tests** in `backend/tests/economics/test_service.py`, using a `FakePort` with `field_info`, `suggested_rotations`, `projection` and `run`. Its `run` returns `RotationRun`s with hand-made `track_yields` (2 tracks), where yield depends on the scenario's `temp_delta_c`, so results are known by hand. Tests:
  - `test_climate_bill_and_win_back`: yours' bill p50 < 0; `best_alternative.wins_back_share` equals the hand value; the sentence contains "wins back"; with `heat_response="published"`, `other_heat_response == "local"`, and the fake saw one scenario run with `heat_response="local"`
  - `test_whole_field_uses_area`: `change_whole_field.p50 == round(change.p50 * area)`
  - `test_bad_years_per_priced_rotation`: `losing_season_share`, `worst_season_usd_ha` and `cash_cushion_worst_usd_ha` match hand values
  - `test_only_one_priced_rotation`: rotations `[maize-soybean, winter_wheat-soybean]` → `who_earns_most is None`, `best_alternative is None`, `excluded_rotations[0].rotation_id` is the wheat one
  - `test_unpriced_yours_is_422_message`: `pytest.raises(service.InvalidRequest, match="no Iowa price")`
  - `test_your_numbers_for_unpriced_crop_rejected`: `prices_usd_t={"winter_wheat": 200}` and, separately, `price_crop="sunflower"` → `InvalidRequest`
  - `test_own_land_raises_margin_by_rent`: bill `today.p50(own) - today.p50(rent) == round(RENT_USD_HA)`; `OWN_LAND` is in `notes`; the `rent` input shows `source == "Your number"`
  - `test_defaulted_rotations`: `rotations=None` → `yours_assumed`, `yours_rotation_id == "B"`, and an assumption whose source is `DEFAULT_YOURS_SOURCE`
  - `test_projection_drives_grid_rain_and_your_cell`: the fake projection gives `temp_change_c=2.4, rain_change_pct=-6` → `who_earns_most.rain_change_pct == -6`, `your_cell.row == 2`, `your_cell.exact is False`, and the fake saw grid runs with `rain_change_pct=-6` and `projection=None`
  - `test_irrigation_assumption_only_when_irrigated`: the topic is absent for `"none"` and present for `"full"`
  - `test_notes_carry_caveat_and_not_calibrated`: the fake returns `calibrated=False` → `CAVEAT` and `NOT_CALIBRATED` are both in `notes`

- [ ] **Step 2: Run to see them fail**

Run: `.venv/bin/python -m pytest tests/economics/test_service.py -q`
Expected: FAIL, `ImportError ... service`

- [ ] **Step 3: Write `service.py`**, following the steps above. Keep it to orchestration; the maths stays in `money.py` and the text in `sentences.py`.

- [ ] **Step 4: Run to see them pass**

Run: `.venv/bin/python -m pytest tests/economics -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/economics/service.py backend/tests/economics/test_service.py
git commit -m "Economics: climate bill, bad-year money and who-earns-most report"
```

---

### Task 6: HTTP API, consistency with the Simulator, timing

**Files:**
- Create: `backend/app/modules/economics/router.py`
- Modify: `backend/app/main.py` (one import, one `include_router` line after the Simulator's)
- Test: `backend/tests/economics/test_api.py`

**Interfaces:**
- Consumes: `service.get_defaults`, `service.build_report`, and the three errors.
- Produces: `router = APIRouter(prefix="/api/farms/{farm_id}/economics", tags=["economics"])`. Endpoints:
  - `GET /defaults` → `EconomicsDefaults`
  - `POST /report` → `EconomicsReport`

  Errors map in a `_call` helper like `simulator/router.py`: `NotFound` → 404, `InvalidRequest` → 422, `WeatherUnavailable` → 503 with `f"{e} Try again, or use the demo farm, which works offline."`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/economics/test_api.py` (uses the `api` fixture)

```python
import time

ECON, SIM = "/api/farms/demo/economics", "/api/farms/demo/simulations"
ROTS = [{"id": "B", "name": "Maize → Soybean", "crops": ["maize", "soybean"]},
        {"id": "A", "name": "Continuous maize", "crops": ["maize"]},
        {"id": "C", "name": "Maize → Soybean → Oats", "crops": ["maize", "soybean", "oats"], "cover_crop": True}]
SC = {"temp_delta_c": 2, "rain_change_pct": -20, "years": 5}

def test_defaults(api):
    body = api.get(f"{ECON}/defaults").json()
    assert body["default_yours_rotation_id"] == "B"
    assert {i["id"] for i in body["inputs"]} >= {"price.maize", "cost.maize", "rent", "irrigation", "cover_crop"}

def test_report_matches_simulator_margins(api):
    sim = api.post(f"{SIM}/run", json={"field_id": "north", "rotations": ROTS, "scenario": SC,
                                       "include_economics": True}).json()
    t0 = time.perf_counter()
    rep = api.post(f"{ECON}/report", json={"field_id": "north", "rotations": ROTS, "scenario": SC}).json()
    print(f"economics report: {time.perf_counter() - t0:.2f} s")
    by_id = {b["rotation_id"]: b["annual_margin"] for b in rep["bad_years"]}
    for r in sim["rotations"]:
        for q in ("p10", "p50", "p90"):
            assert abs(by_id[r["rotation_id"]][q] - r["economics"]["margin_per_ha"][q]) <= 3
    assert rep["climate_bill"]["kind"] == "modelled" and rep["area"]["kind"] == "observed"
    assert rep["who_earns_most"]["cells"] and len(rep["who_earns_most"]["cells"]) == 5
    assert time.perf_counter() - t0 <= 7  # Kiril: 7 s max

def test_errors(api):
    assert api.post("/api/farms/nope/economics/report", json={"field_id": "north"}).status_code == 404
    wheat = [{"id": "W", "name": "Wheat", "crops": ["winter_wheat"]}]
    assert api.post(f"{ECON}/report", json={"field_id": "north", "rotations": wheat}).status_code == 422
```

Check the crop id in `simulator/parameters.py` (`CROPS`) before using `"winter_wheat"`, and use the real id.

- [ ] **Step 2: Run to see them fail**

Run: `.venv/bin/python -m pytest tests/economics/test_api.py -q`
Expected: FAIL, 404 on `/economics/defaults`

- [ ] **Step 3: Write `router.py`** and register it in `main.py`.

- [ ] **Step 4: Run to see them pass, and record the time**

Run: `.venv/bin/python -m pytest tests/economics/test_api.py -q -s`
Expected: 3 passed, and a line `economics report: X.XX s` with X.XX ≤ 7. If it's slower, make `build_report` faster without shrinking the default grid (reuse the today run for a grid row with `w == 0` and grid rain 0; reuse runs that share a scenario). If a consistency check fails, find which of the spec §6.2 rules (predecessor, cover crop, rent split) disagrees with `simulator/service.py::_rotation_result`. Fix the economics side; never the Simulator.

- [ ] **Step 5: Full checks**

Run: `.venv/bin/python -m pytest -q && cd ../frontend && npm run build`
Expected: all pass; the build is clean

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/economics/router.py backend/app/main.py backend/tests/economics/test_api.py
git commit -m "Economics: HTTP API, checked against the Simulator's margins"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/modules/economics.md` (status line, the measured report time, anything that changed in build)
- Modify: `README.md` (module table row, dependency diagram with Economics above the Simulator, repository layout line, Status bullet)

- [ ] **Step 1: Update `docs/modules/economics.md`**: set the status to "built (backend)", add the test count and the measured report time, and add a "Run it" block with the two curl calls:
  - `GET /api/farms/demo/economics/defaults`
  - `POST /api/farms/demo/economics/report` with `{"field_id":"north"}`

- [ ] **Step 2: Update `README.md`** with an Economics row: *What does each option earn, and how bad do the bad years get?*, backend path, frontend "central dashboard (andrej)". Add `Economics ──► Simulator (service.py)` to the diagram, plus the rule "Nothing imports Economics except through its service.py".

- [ ] **Step 3: Check the commands in the doc work**, with the API running (`uvicorn app.main:app --port 8000`). Run both curl calls.
Expected: 200 and JSON for both

- [ ] **Step 4: Commit**

```bash
git add docs/modules/economics.md README.md
git commit -m "Economics: docs and README module entry"
```
