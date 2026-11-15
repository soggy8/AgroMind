"""Economics orchestration: run the Simulator through the port and assemble the money report.

The only file other modules may import. The maths is in money.py, the text in sentences.py, and the
Simulator is reached only through `port` (ports.py by default; tests pass a fake with the same five
functions). Results are Modelled, money inputs Scenario, and field area Observed (spec section 10).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from . import money, ports, sentences
from .parameters import (ACRES_PER_HA, COVER_CROP_SOURCE, COVER_CROP_USD_HA, CROP_MONEY, DEFAULT_YOURS_CROPS,
                         DEFAULT_YOURS_SOURCE, IRRIGATION_SOURCE, IRRIGATION_USD_PER_MM_HA, NEAR_TIE_SOURCE,
                         NEAR_TIE_USD_HA, RENT_DISPLAY, RENT_SOURCE, RENT_USD_HA)
from .schemas import (Area, Assumption, BadYears, BestAlternative, ClimateBill, EconomicsDefaults, EconomicsReport,
                      EconomicsRequest, EconScenario, ExcludedRotation, GridCell, GridSpec, MoneyInput, RotationInput,
                      Stat, WhoEarnsMost, YourCell, YourNumbers)

# Re-exported so the router can map them to HTTP errors.
NotFound = ports.NotFound
InvalidRequest = ports.InvalidRequest
WeatherUnavailable = ports.WeatherUnavailable

YOUR_NUMBER = "Your number"
AFTER_SELF_SOURCE = "Your number + ISU A1-20 (2026) corn-after-corn difference"
ANNUAL, SEASON, WHOLE_FIELD = "USD/ha/year", "USD/ha/season", "USD/year"
AREA_SOURCE = "CropTwin field record"
IRRIGATION_P50_SOURCE = ("ASSUME: the Simulator's public result gives each season's irrigation as p10/p50/p90, "
                         "not per weather year (docs/modules/economics.md section 6.6)")
NO_GRID_NOTE = "Who earns most needs at least two rotations with Iowa price and cost data."


# ---------- names and messages ----------

def _cap(text: str) -> str:
    return text[:1].upper() + text[1:]


def _crop_names(crop_ids: list[str]) -> str:
    names = [CROP_MONEY[c].name.lower() if c in CROP_MONEY else c.replace("_", " ") for c in crop_ids]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def _no_data(crop_ids: list[str]) -> str:
    return f"{_crop_names(crop_ids)} {'has' if len(crop_ids) == 1 else 'have'} no Iowa price and cost data"


def _unpriced(crops: list[str]) -> list[str]:
    return list(dict.fromkeys(c for c in crops if c not in CROP_MONEY))


def _not_known(crop_ids: list[str], which: bool = False) -> str:
    """"'banana' isn't a known crop", or "'banana', which isn't a known crop" after a rotation name."""
    quoted = [f"'{c}'" for c in crop_ids]
    joined = quoted[0] if len(quoted) == 1 else ", ".join(quoted[:-1]) + " and " + quoted[-1]
    verb = "isn't a known crop" if len(quoted) == 1 else "aren't known crops"
    return f"{joined}, which {verb}" if which else f"{joined} {verb}"


def _check_known_crops(session: Session, farm_id: str, req: EconomicsRequest, rotations: list[RotationInput],
                       port) -> None:
    """A crop id outside the Simulator's catalogue is a mistake in the request (422), not an unpriced crop."""
    your = req.your_numbers
    named = [c for r in rotations for c in r.crops] + list(your.prices_usd_t) + list(your.costs_before_rent_usd_ha)
    if not _unpriced(named + ([req.price_crop] if req.price_crop else [])):
        return  # every priced crop is in the catalogue
    known = port.known_crops(session, farm_id)
    for r in rotations:
        unknown = [c for c in _unpriced(r.crops) if c not in known]
        if unknown:
            raise InvalidRequest(f"{r.name} includes {_not_known(unknown, which=True)}.")
    for kind, given in (("price", your.prices_usd_t), ("cost", your.costs_before_rent_usd_ha)):
        unknown = [c for c in _unpriced(list(given)) if c not in known]
        if unknown:
            raise InvalidRequest(f"{_not_known(unknown)}, so your own {kind} can't be used.")
    if req.price_crop is not None and req.price_crop not in known:
        raise InvalidRequest(f"{_not_known([req.price_crop])}, so the price change can't be applied to it alone.")


# ---------- money inputs ----------

def _metric(value: float, unit: str) -> str:
    return f"${value:,.2f}/{unit.removeprefix('USD/')}"


def _per_acre(usd_ha: float) -> str:
    return f"${round(usd_ha / ACRES_PER_HA, 2):g}/ac"


def resolve_inputs(your: YourNumbers) -> tuple[money.MoneyInputs, list[MoneyInput]]:
    """The numbers the money maths uses: the farmer's own where given, else the sourced defaults.

    A farmer's own maize cost keeps ISU's extra cost of maize after maize on top for that case.
    """
    for kind, given in (("price", your.prices_usd_t), ("cost", your.costs_before_rent_usd_ha)):
        unknown = [c for c in given if c not in CROP_MONEY]
        if unknown:
            raise InvalidRequest(f"{_cap(_no_data(unknown))}, so your own {kind} can't be used.")

    rows: list[MoneyInput] = []

    def use(id_: str, label: str, unit: str, default: float, display: str, source: str,
            mine: float | None = None, digits: int = 2, mine_source: str = YOUR_NUMBER) -> float:
        if mine is None:
            rows.append(MoneyInput(id=id_, label=label, value=round(default, digits), unit=unit, display=display,
                                   source=source))
            return default
        rows.append(MoneyInput(id=id_, label=label, value=round(mine, digits), unit=unit, display=_metric(mine, unit),
                               source=mine_source))
        return mine

    price, typical, cost, after_self = {}, {}, {}, {}
    for c, cm in CROP_MONEY.items():
        own_cost = your.costs_before_rent_usd_ha.get(c)
        price[c] = use(f"price.{c}", f"{cm.name} price", "USD/t", cm.price_usd_t, cm.display["price"],
                       cm.sources["price"], your.prices_usd_t.get(c))
        typical[c] = use(f"yield.{c}", f"{cm.name} typical yield", "t/ha", cm.typical_yield_t_ha, cm.display["yield"],
                         cm.sources["yield"], digits=3)
        cost[c] = use(f"cost.{c}", f"{cm.name} cost before rent", "USD/ha", cm.cost_before_rent_usd_ha,
                      cm.display["cost"], cm.sources["cost"], own_cost)
        if cm.cost_after_self_before_rent_usd_ha is not None:
            extra = cm.cost_after_self_before_rent_usd_ha - cm.cost_before_rent_usd_ha  # ISU's after-itself extra
            after_self[c] = use(f"cost_after_self.{c}", f"{cm.name} after {cm.name.lower()} cost before rent", "USD/ha",
                                cm.cost_after_self_before_rent_usd_ha, _per_acre(cm.cost_after_self_before_rent_usd_ha),
                                cm.sources["cost"], None if own_cost is None else own_cost + extra,
                                mine_source=AFTER_SELF_SOURCE)
    if your.land == "own":  # owning overrides any rent given
        rows.append(MoneyInput(id="rent", label="Cash rent", value=0.0, unit="USD/ha", display="own land",
                               source=YOUR_NUMBER))
        rent = 0.0
    else:
        rent = use("rent", "Cash rent", "USD/ha", RENT_USD_HA, RENT_DISPLAY, RENT_SOURCE, your.rent_usd_ha)
    irrigation = use("irrigation", "Irrigation cost", "USD/mm/ha", IRRIGATION_USD_PER_MM_HA,
                     _metric(IRRIGATION_USD_PER_MM_HA, "USD/mm/ha"), IRRIGATION_SOURCE, your.irrigation_usd_per_mm_ha)
    cover = use("cover_crop", "Rye cover crop cost", "USD/ha", COVER_CROP_USD_HA, _per_acre(COVER_CROP_USD_HA),
                COVER_CROP_SOURCE, your.cover_crop_usd_ha)
    m = money.MoneyInputs(price_usd_t=price, typical_yield_t_ha=typical, cost_before_rent_usd_ha=cost,
                          cost_after_self_before_rent_usd_ha=after_self, rent_usd_ha=rent,
                          irrigation_usd_per_mm_ha=irrigation, cover_crop_usd_ha=cover)
    return m, rows


# ---------- defaults ----------

def _default_yours(suggested: list[RotationInput]) -> RotationInput:
    return next((r for r in suggested if tuple(r.crops) == DEFAULT_YOURS_CROPS), suggested[0])


def get_defaults(session: Session, farm_id: str, *, port=ports) -> EconomicsDefaults:
    suggested = port.suggested_rotations(session, farm_id)
    return EconomicsDefaults(inputs=resolve_inputs(YourNumbers())[1], suggested_rotations=suggested,
                             default_yours_rotation_id=_default_yours(suggested).id, grid=GridSpec())


# ---------- runs and margins ----------

def _scenario_key(scenario: EconScenario) -> tuple:
    """A run's identity within a report. With no warming the heat response changes nothing, so both share a key."""
    d = scenario.model_dump()
    if scenario.temp_delta_c == 0 and scenario.projection is None:
        d["heat_response"] = "published"
    return tuple(sorted(d.items()))


def _run_cached(cache: dict, port, session: Session, farm_id: str, field_id: str,
                rotations: list[RotationInput], scenario: EconScenario) -> ports.Run:
    """port.run once per distinct scenario in a report: today's climate is often grid row 0 as well.

    A cached run holding every rotation asked for is reused: rotation ids are unique within a report, and
    the Simulator simulates each rotation on its own, so a rotation's result doesn't depend on the others.
    """
    key = _scenario_key(scenario)
    hit = cache.get(key)
    if hit is None or not {r.id for r in rotations} <= hit.rotations.keys():
        cache[key] = hit = port.run(session, farm_id, field_id, rotations, scenario)
    return hit


@dataclass(frozen=True)
class _Pricing:
    m: money.MoneyInputs
    rotations: list[RotationInput]  # priced, yours first
    first_predecessor: str | None
    years: int
    price_crop: str | None

    def seasons(self, run: ports.Run, price_change_pct: float,
                rotations: list[RotationInput] | None = None) -> dict[str, np.ndarray]:
        out = {}
        for r in rotations or self.rotations:
            rr = run.rotations[r.id]
            out[r.id] = money.season_margins(rr.season_crops, self.first_predecessor, rr.track_yields,
                                             rr.irrigation_mm_p50, r.cover_crop, self.m, price_change_pct,
                                             self.price_crop)
        return out

    def annual(self, seasons: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
        return {k: money.annual_margins(v, self.years) for k, v in seasons.items()}


def _other_heat_response(heat_response: str) -> str:
    return "local" if heat_response == "published" else "published"


def _usd(x: float) -> float:
    return float(round(float(x)))


def _stat(values: np.ndarray, unit: str) -> Stat:
    q = money.p3(values)
    return Stat(p10=_usd(q.p10), p50=_usd(q.p50), p90=_usd(q.p90), unit=unit)


def _sources(rotations: list[RotationInput], inputs: list[MoneyInput], irrigated: bool, *extra: str) -> list[str]:
    """Price, yield and cost sources of the rotations' crops, then rent, the cover crop when any rotation has
    one, irrigation when the scenario irrigates, and any extras: de-duplicated, in order."""
    src = {i.id: i.source for i in inputs}
    ids = [i for r in rotations for c in r.crops for i in (f"price.{c}", f"yield.{c}", f"cost.{c}", f"cost_after_self.{c}")
           if i in src]
    out = [src[i] for i in ids] + [src["rent"]]
    if any(r.cover_crop for r in rotations):
        out.append(src["cover_crop"])
    if irrigated:
        out += [src["irrigation"], IRRIGATION_P50_SOURCE]
    return list(dict.fromkeys(out + list(extra)))


# ---------- blocks (spec section 6.4) ----------

def _best_alternative(yours: RotationInput, priced: list[RotationInput], scen: dict[str, np.ndarray],
                      change_p50: float) -> BestAlternative | None:
    alts = [r for r in priced if r.id != yours.id]
    if not alts:
        return None
    alt = max(alts, key=lambda r: money.p3(scen[r.id]).p50)
    wins_back = _usd(money.p3(scen[alt.id] - scen[yours.id]).p50)
    share = round(wins_back / -change_p50, 3) if change_p50 < 0 and wins_back > 0 else None
    return BestAlternative(rotation_id=alt.id, name=alt.name, scenario_margin=_stat(scen[alt.id], ANNUAL),
                           wins_back_usd_ha=wins_back, wins_back_share=share)


def _climate_bill(req: EconomicsRequest, yours: RotationInput, priced: list[RotationInput], area_ha: float,
                  today: dict[str, np.ndarray], scen: dict[str, np.ndarray], other: dict[str, np.ndarray],
                  label: str, inputs: list[MoneyInput]) -> ClimateBill:
    paired = scen[yours.id] - today[yours.id]  # paired by weather track
    change = _stat(paired, ANNUAL)
    whole = _stat(paired * area_ha, WHOLE_FIELD)  # from the unrounded change
    best = _best_alternative(yours, priced, scen, change.p50)
    block = [yours] + [r for r in priced if best is not None and r.id == best.rotation_id]
    sources = _sources(block, inputs, req.scenario.irrigation != "none")
    sentence = sentences.climate_bill(yours.name, label, change.p50, best.name if best else None,
                                      best.wins_back_usd_ha if best else None,
                                      best.wins_back_share if best else None, req.units)
    return ClimateBill(
        rotation_id=yours.id, name=yours.name, today=_stat(today[yours.id], ANNUAL),
        scenario=_stat(scen[yours.id], ANNUAL), change=change, change_whole_field=whole,
        other_heat_response=_other_heat_response(req.scenario.heat_response),
        other_heat_response_change_usd_ha=_usd(money.p3(other[yours.id] - today[yours.id]).p50),
        best_alternative=best, sentence=sentence, sources=sources)


def _bad_years(r: RotationInput, seasons: np.ndarray, years: int, units: str, sources: list[str]) -> BadYears:
    cushion = money.cash_cushion(seasons)
    share = round(money.losing_season_share(seasons), 3)
    worst, cushion_worst = _usd(seasons.min()), _usd(cushion.max())
    return BadYears(
        rotation_id=r.id, name=r.name, annual_margin=_stat(money.annual_margins(seasons, years), ANNUAL),
        season_margin=_stat(seasons.ravel(), SEASON), seasons_total=int(seasons.size), losing_season_share=share,
        losing_runs=money.losing_runs(seasons), runs=int(seasons.shape[1]), worst_season_usd_ha=worst,
        cash_cushion_worst_usd_ha=cushion_worst, cash_cushion_typical_usd_ha=_usd(money.p3(cushion).p50),
        sentence=sentences.bad_years(r.name, share, worst, cushion_worst, units), sources=sources)


def _nearest(values: list[float], target: float) -> int:
    return min(range(len(values)), key=lambda i: abs(values[i] - target))


def _grid(req: EconomicsRequest, yours: RotationInput, pricing: _Pricing, row_runs: list[ports.Run],
          rain: float, rain_source: str, warming: float, projected: bool, sources: list[str]) -> WhoEarnsMost:
    g = req.grid
    cells: list[list[GridCell]] = []
    for run in row_runs:  # rows are warming levels; prices change by arithmetic, so only rows need runs
        row = []
        for pct in g.price_change_pct:
            p50 = {k: money.p3(v).p50 for k, v in pricing.annual(pricing.seasons(run, pct)).items()}
            winner, tie = money.grid_winner(p50, NEAR_TIE_USD_HA)
            row.append(GridCell(winner_rotation_id=winner, near_tie=tie,
                                margin_p50_usd_ha={k: _usd(v) for k, v in p50.items()}))
        cells.append(row)
    r, c = _nearest(g.warming_c, warming), _nearest(g.price_change_pct, req.price_change_pct)
    # a grid row only approximates a projection: uniform warming and the May-Sep median rain change
    exact = not projected and g.warming_c[r] == warming and g.price_change_pct[c] == req.price_change_pct
    winners = [[cell.winner_rotation_id for cell in row] for row in cells]
    sp = money.switch_points(winners, g.warming_c, g.price_change_pct, yours.id)
    sentence = sentences.switch(
        sp, {p.id: p.name for p in pricing.rotations}, yours.id, warming_c=g.warming_c[money.nearest_zero(g.warming_c)],
        rain_change_pct=rain, price_change_pct=g.price_change_pct[money.nearest_zero(g.price_change_pct)],
        price_crop=CROP_MONEY[req.price_crop].name.lower() if req.price_crop else None)
    return WhoEarnsMost(
        warming_c=g.warming_c, price_change_pct=g.price_change_pct, price_crop=req.price_crop,
        rain_change_pct=rain, rain_change_source=rain_source, cells=cells, your_cell=YourCell(row=r, col=c, exact=exact),
        sentence=sentence, sources=sources)


def _assumptions(req: EconomicsRequest, priced: list[RotationInput], yours: RotationInput, yours_assumed: bool,
                 has_grid: bool) -> list[Assumption]:
    """ASSUME values that shaped this report; a value the farmer replaced is theirs, not an assumption."""
    your, a = req.your_numbers, []
    if any("oats" in r.crops for r in priced) and "oats" not in your.costs_before_rent_usd_ha:
        oats = CROP_MONEY["oats"]
        a.append(Assumption(topic="Oats cost", text=f"Oats cost before rent is an estimate ({oats.display['cost']}): "
                            "ISU publishes no grain-oat budget.", source=oats.sources["cost"]))
    if req.scenario.irrigation != "none":
        if your.irrigation_usd_per_mm_ha is None:
            a.append(Assumption(topic="Irrigation cost", text=f"Irrigation costs ${IRRIGATION_USD_PER_MM_HA:.2f} per mm "
                                "per ha, pumping and energy only.", source=IRRIGATION_SOURCE))
        a.append(Assumption(topic="Irrigation per weather year", text="Every weather year is costed with the season's "
                            "median (p50) irrigation, because the Simulator reports irrigation per season, not per "
                            "year. Rain-fed results are not affected.", source=IRRIGATION_P50_SOURCE))
    if any(r.cover_crop for r in priced) and your.cover_crop_usd_ha is None:
        a.append(Assumption(topic="Cover-crop cost", text=f"Cereal rye costs {_per_acre(COVER_CROP_USD_HA)} in every "
                            "season of a rotation with a cover crop.", source=COVER_CROP_SOURCE))
    if has_grid:
        a.append(Assumption(topic="Too close to call", text=f"A grid cell names no winner when the top two rotations "
                            f"are within ${NEAR_TIE_USD_HA:.0f}/ha a year.", source=NEAR_TIE_SOURCE))
    if yours_assumed:
        a.append(Assumption(topic="Your rotation", text=f"No rotations were given, so {yours.name} is taken as yours "
                            "and compared with the other suggested rotations.", source=DEFAULT_YOURS_SOURCE))
    return a


# ---------- the report ----------

def _resolve_rotations(session: Session, farm_id: str, req: EconomicsRequest, port) -> tuple[list[RotationInput], bool]:
    if req.rotations:
        return list(req.rotations), False
    suggested = port.suggested_rotations(session, farm_id)
    yours = _default_yours(suggested)
    return [yours] + [r for r in suggested if r is not yours], True


def _split_priced(rotations: list[RotationInput]) -> tuple[list[RotationInput], list[ExcludedRotation]]:
    priced, excluded = [], []
    for i, r in enumerate(rotations):
        missing = _unpriced(r.crops)
        if not missing:
            priced.append(r)
        elif i == 0:
            raise InvalidRequest(f"{r.name} includes {_crop_names(missing)}, which "
                                 f"{'has' if len(missing) == 1 else 'have'} no Iowa price and cost data, "
                                 "so it can't be priced.")
        else:
            excluded.append(ExcludedRotation(rotation_id=r.id, reason=f"{_cap(_no_data(missing))}."))
    return priced, excluded


def build_report(session: Session, farm_id: str, req: EconomicsRequest, *, port=ports) -> EconomicsReport:
    field = port.field_info(session, farm_id, req.field_id)
    rotations, yours_assumed = _resolve_rotations(session, farm_id, req, port)
    _check_known_crops(session, farm_id, req, rotations, port)
    m, inputs = resolve_inputs(req.your_numbers)
    if req.price_crop is not None and req.price_crop not in CROP_MONEY:
        raise InvalidRequest(f"{_cap(_no_data([req.price_crop]))}, so the price change can't be applied to it alone.")
    yours = rotations[0]
    priced, excluded = _split_priced(rotations)
    sc = req.scenario
    proj = port.projection(session, farm_id, sc.projection) if sc.projection else None
    label = proj.label if proj else sentences.scenario_label(sc.temp_delta_c, sc.rain_change_pct, None)

    cache: dict = {}

    def run(rotations: list[RotationInput], **update) -> ports.Run:
        return _run_cached(cache, port, session, farm_id, req.field_id, rotations, sc.model_copy(update=update))

    has_grid = len(priced) >= 2
    rain = max(-50.0, min(30.0, proj.rain_change_pct if proj else sc.rain_change_pct))  # the grid rows' rain
    # Today and the other heat response are for yours only, unless today is also a grid row (then the grid reuses it).
    today_rotations = priced if has_grid and rain == 0 and 0 in req.grid.warming_c else [yours]
    pricing, pct = _Pricing(m, priced, field.current_crop_id, sc.years, req.price_crop), req.price_change_pct
    scen_run = run(priced)
    scen_seasons = pricing.seasons(scen_run, pct)
    scen = pricing.annual(scen_seasons)
    today_run = run(today_rotations, temp_delta_c=0.0, rain_change_pct=0.0, projection=None)
    today = pricing.annual(pricing.seasons(today_run, pct, [yours]))
    other = pricing.annual(pricing.seasons(run([yours], heat_response=_other_heat_response(sc.heat_response)), pct,
                                           [yours]))

    irrigated = sc.irrigation != "none"
    bill = _climate_bill(req, yours, priced, field.area_ha, today, scen, other, label, inputs)
    bad = [_bad_years(r, scen_seasons[r.id], sc.years, req.units, _sources([r], inputs, irrigated)) for r in priced]

    grid = None
    if has_grid:
        rain_source = "the projection's May-Sep median rain change" if proj else "the scenario's rain change"
        rows = [run(priced, temp_delta_c=w, rain_change_pct=rain, projection=None) for w in req.grid.warming_c]
        grid = _grid(req, yours, pricing, rows, rain, rain_source, proj.temp_change_c if proj else sc.temp_delta_c,
                     proj is not None, _sources(priced, inputs, irrigated, NEAR_TIE_SOURCE))

    notes = [sentences.CAVEAT, sentences.OWN_LAND if req.your_numbers.land == "own" else sentences.RENT_LAND]
    if grid is None:
        notes.append(NO_GRID_NOTE)
    if not scen_run.calibrated and "uncalibrated" not in scen_run.data_note.lower():  # one calibration note
        notes.append(sentences.NOT_CALIBRATED)
    if scen_run.data_note:
        notes.append(scen_run.data_note)

    return EconomicsReport(
        farm_id=farm_id, field_id=field.field_id, field_name=field.name,
        area=Area(value_ha=field.area_ha, source=AREA_SOURCE), scenario=sc, scenario_label=label,
        price_change_pct=req.price_change_pct, price_crop=req.price_crop, units=req.units,
        yours_rotation_id=yours.id, yours_assumed=yours_assumed, climate_bill=bill, bad_years=bad,
        who_earns_most=grid, inputs_used=inputs, excluded_rotations=excluded,
        assumptions=_assumptions(req, priced, yours, yours_assumed, grid is not None), notes=notes,
        calibrated=scen_run.calibrated, ensemble_size=len(scen_run.ensemble_start_years),
        ensemble_start_years=list(scen_run.ensemble_start_years), data_note=scen_run.data_note,
        simulator_model_version=scen_run.model_version)
