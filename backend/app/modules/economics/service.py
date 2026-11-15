"""Economics orchestration. The only file other modules may import.

Runs the Simulator several times through `ports` (today, the scenario, the other heat response and
one run per warming row of the grid), prices every weather track with `money`, and writes the
sentences with `sentences`. The maths stays in `money.py` and the text in `sentences.py`.
"""
from __future__ import annotations

from types import ModuleType

import numpy as np
from sqlalchemy.orm import Session

from . import money, ports
from . import parameters as p
from . import sentences as s
from .schemas import (Area, Assumption, BadYears, BestAlternative, ClimateBill, EconomicsDefaults, EconomicsReport,
                      EconomicsRequest, EconScenario, ExcludedRotation, GridCell, GridSpec, MoneyInput,
                      RotationInput, Stat, WhoEarnsMost, YourCell, YourNumbers)

# Re-exported so the router can map them to HTTP errors.
NotFound = ports.NotFound
InvalidRequest = ports.InvalidRequest
WeatherUnavailable = ports.WeatherUnavailable

YOUR_NUMBER = "Your number"
USD_HA_YEAR = "USD/ha/year"
SIM_SOURCE = "AgroMind Simulator: daily water balance on NASA POWER weather, replayed for every start year 2001-2025"


# ---------- inputs ----------

def _crop_label(crop_id: str) -> str:
    c = p.CROP_MONEY.get(crop_id)
    return c.name.lower() if c else crop_id.replace("_", " ")


def _join(words: list[str]) -> str:
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def _unpriced(crops: list[str]) -> list[str]:
    return sorted({c for c in crops if c not in p.CROP_MONEY})


def resolve_inputs(your: YourNumbers) -> tuple[money.MoneyInputs, list[MoneyInput]]:
    """The money numbers to use: the farmer's where given, the sourced defaults otherwise."""
    unknown = sorted(c for c in {*your.prices_usd_t, *your.costs_before_rent_usd_ha} if c not in p.CROP_MONEY)
    if unknown:
        raise InvalidRequest(f"There's no Iowa price and cost data for {_join([_crop_label(c) for c in unknown])}, "
                             f"so your numbers for it can't be used. Priced crops: "
                             f"{_join([c.name.lower() for c in p.CROP_MONEY.values()])}.")

    price, yld, cost, after_self = {}, {}, {}, {}
    used: list[MoneyInput] = []
    for cid, c in p.CROP_MONEY.items():
        if cid in your.prices_usd_t:
            v = your.prices_usd_t[cid]
            used.append(MoneyInput(id=f"price.{cid}", label=f"{c.name} price", value=round(v, 2), unit="USD/t",
                                   display=f"${v:,.0f}/t", source=YOUR_NUMBER))
        else:
            v = c.price_usd_t
            used.append(MoneyInput(id=f"price.{cid}", label=f"{c.name} price", value=round(v, 2), unit="USD/t",
                                   display=c.display["price"], source=c.sources["price"]))
        price[cid] = v

        yld[cid] = c.typical_yield_t_ha
        used.append(MoneyInput(id=f"yield.{cid}", label=f"{c.name} typical yield", value=round(c.typical_yield_t_ha, 2),
                               unit="t/ha", display=c.display["yield"], source=c.sources["yield"]))

        if cid in your.costs_before_rent_usd_ha:
            v = your.costs_before_rent_usd_ha[cid]
            used.append(MoneyInput(id=f"cost.{cid}", label=f"{c.name} cost before rent", value=round(v, 2),
                                   unit="USD/ha", display=f"${v:,.0f}/ha", source=YOUR_NUMBER))
        else:
            v = c.cost_before_rent_usd_ha
            used.append(MoneyInput(id=f"cost.{cid}", label=f"{c.name} cost before rent", value=round(v, 2),
                                   unit="USD/ha", display=c.display["cost"], source=c.sources["cost"]))
        cost[cid] = v

        if c.cost_after_self_before_rent_usd_ha is not None:
            extra = c.cost_after_self_before_rent_usd_ha - c.cost_before_rent_usd_ha
            mine = cid in your.costs_before_rent_usd_ha
            after_self[cid] = v + extra
            used.append(MoneyInput(
                id=f"cost_after_self.{cid}", label=f"{c.name} cost before rent, after {c.name.lower()}",
                value=round(after_self[cid], 2), unit="USD/ha",
                display=f"${after_self[cid]:,.0f}/ha" if mine else f"${(c.cost_after_self_before_rent_usd_ha / p.ACRES_PER_HA):,.2f}/ac",
                source=(f"{YOUR_NUMBER}, plus ISU's extra cost of {c.name.lower()} after {c.name.lower()} "
                        f"(${extra:,.0f}/ha)") if mine else c.sources["cost"]))

    if your.land == "own":
        rent = 0.0
        used.append(MoneyInput(id="rent", label="Cash rent", value=0.0, unit="USD/ha", display="own land",
                               source=YOUR_NUMBER))
    elif your.rent_usd_ha is not None:
        rent = your.rent_usd_ha
        used.append(MoneyInput(id="rent", label="Cash rent", value=round(rent, 2), unit="USD/ha",
                               display=f"${rent:,.0f}/ha", source=YOUR_NUMBER))
    else:
        rent = p.RENT_USD_HA
        used.append(MoneyInput(id="rent", label="Cash rent", value=round(rent, 2), unit="USD/ha",
                               display=p.RENT_DISPLAY, source=p.RENT_SOURCE))

    irr = your.irrigation_usd_per_mm_ha if your.irrigation_usd_per_mm_ha is not None else p.IRRIGATION_USD_PER_MM_HA
    used.append(MoneyInput(id="irrigation", label="Irrigation", value=round(irr, 2), unit="USD/mm/ha",
                           display=f"${irr:,.2f} per mm per ha",
                           source=YOUR_NUMBER if your.irrigation_usd_per_mm_ha is not None else p.IRRIGATION_SOURCE))
    cover = your.cover_crop_usd_ha if your.cover_crop_usd_ha is not None else p.COVER_CROP_USD_HA
    used.append(MoneyInput(id="cover_crop", label="Rye cover crop", value=round(cover, 2), unit="USD/ha",
                           display=f"${cover:,.0f}/ha" if your.cover_crop_usd_ha is not None else "$35/ac",
                           source=YOUR_NUMBER if your.cover_crop_usd_ha is not None else p.COVER_CROP_SOURCE))

    m = money.MoneyInputs(price_usd_t=price, typical_yield_t_ha=yld, cost_before_rent_usd_ha=cost,
                          cost_after_self_before_rent_usd_ha=after_self, rent_usd_ha=rent,
                          irrigation_usd_per_mm_ha=irr, cover_crop_usd_ha=cover)
    return m, used


# ---------- defaults ----------

def _default_yours_id(rotations: list[RotationInput]) -> str:
    match = next((r for r in rotations if tuple(r.crops) == p.DEFAULT_YOURS_CROPS), None)
    return (match or rotations[0]).id


def get_defaults(session: Session, farm_id: str, *, port: ModuleType = ports) -> EconomicsDefaults:
    suggested = port.suggested_rotations(session, farm_id)
    _, inputs = resolve_inputs(YourNumbers())
    return EconomicsDefaults(inputs=inputs, suggested_rotations=suggested,
                             default_yours_rotation_id=_default_yours_id(suggested), grid=GridSpec())


# ---------- report ----------

def _stat(x: money.P3, unit: str) -> Stat:
    return Stat(p10=round(x.p10), p50=round(x.p50), p90=round(x.p90), unit=unit)


class _Runs:
    """Simulator runs keyed by scenario, so identical scenarios (e.g. today and the grid's 0 °C row) run once."""

    def __init__(self, port, session, farm_id: str, field_id: str, rotations: list[RotationInput]):
        self.port, self.session, self.farm_id, self.field_id, self.rotations = port, session, farm_id, field_id, rotations
        self._cache: dict[str, ports.Run] = {}

    def get(self, sc: EconScenario) -> ports.Run:
        key = sc.model_dump_json()
        if key not in self._cache:
            self._cache[key] = self.port.run(self.session, self.farm_id, self.field_id, self.rotations, sc)
        return self._cache[key]


def build_report(session: Session, farm_id: str, req: EconomicsRequest, *, port: ModuleType = ports) -> EconomicsReport:
    field = port.field_info(session, farm_id, req.field_id)

    # 1. Rotations; the first is "yours".
    if req.rotations:
        rotations, yours_assumed = list(req.rotations), False
    else:
        suggested = port.suggested_rotations(session, farm_id)
        first = _default_yours_id(suggested)
        rotations = sorted(suggested, key=lambda r: r.id != first)
        yours_assumed = True
    yours = rotations[0]

    # 2. Priced and unpriced rotations.
    missing = _unpriced(yours.crops)
    if missing:
        labels = [_crop_label(c) for c in missing]
        verb = "has" if len(labels) == 1 else "have"
        raise InvalidRequest(f"{yours.name} includes {_join(labels)}, which {verb} no Iowa price and cost data, "
                             f"so it can't be priced.")
    priced = [r for r in rotations if not _unpriced(r.crops)]
    excluded = []
    for r in rotations:
        miss = _unpriced(r.crops)
        if miss:
            labels = [_crop_label(c) for c in miss]
            excluded.append(ExcludedRotation(rotation_id=r.id, reason=f"{_join(labels).capitalize()} "
                                             f"{'has' if len(labels) == 1 else 'have'} no Iowa price and cost data."))
    if req.price_crop is not None and req.price_crop not in p.CROP_MONEY:
        raise InvalidRequest(f"There's no price data for {_crop_label(req.price_crop)}, so its price can't be changed.")
    m, inputs_used = resolve_inputs(req.your_numbers)

    # 3. Runs.
    sc = req.scenario
    proj = port.projection(session, farm_id, sc.projection) if sc.projection else None
    runs = _Runs(port, session, farm_id, req.field_id, priced)
    today_sc = sc.model_copy(update={"temp_delta_c": 0.0, "rain_change_pct": 0.0, "projection": None})
    other_hr = "local" if sc.heat_response == "published" else "published"
    today, scen = runs.get(today_sc), runs.get(sc)
    other = runs.get(sc.model_copy(update={"heat_response": other_hr}))

    def season_m(run: ports.Run, rot: RotationInput, shift: float = req.price_change_pct) -> np.ndarray:
        rr = run.rotations[rot.id]
        return money.season_margins(rr.season_crops, field.current_crop_id, rr.track_yields, rr.irrigation_mm_p50,
                                    rot.cover_crop, m, price_change_pct=shift, price_crop=req.price_crop)

    def annual(run: ports.Run, rot: RotationInput, shift: float = req.price_change_pct) -> np.ndarray:
        return money.annual_margins(season_m(run, rot, shift), sc.years)

    label = s.scenario_label(sc.temp_delta_c, sc.rain_change_pct, proj.label if proj else None)

    # 4a. Climate bill.
    y_today, y_scen, y_other = annual(today, yours), annual(scen, yours), annual(other, yours)
    change = money.p3(y_scen - y_today)
    other_change = money.p3(y_other - y_today).p50
    best = None
    alts = [r for r in priced if r.id != yours.id]
    if alts:
        alt = max(alts, key=lambda r: money.p3(annual(scen, r)).p50)
        alt_annual = annual(scen, alt)
        wins_back = money.p3(alt_annual - y_scen).p50
        share = wins_back / -change.p50 if change.p50 < 0 and wins_back > 0 else None
        best = BestAlternative(rotation_id=alt.id, name=alt.name, scenario_margin=_stat(money.p3(alt_annual), USD_HA_YEAR),
                               wins_back_usd_ha=round(wins_back),
                               wins_back_share=round(share, 3) if share is not None else None)
    used_crops = {c for r in priced for c in r.crops}
    sources = sorted({i.source for i in inputs_used
                      if i.id in {"rent"} or i.id.split(".")[-1] in used_crops and not i.id.startswith("yield")}
                     | {SIM_SOURCE})
    bill = ClimateBill(
        rotation_id=yours.id, name=yours.name,
        today=_stat(money.p3(y_today), USD_HA_YEAR), scenario=_stat(money.p3(y_scen), USD_HA_YEAR),
        change=_stat(change, USD_HA_YEAR),
        change_whole_field=_stat(money.p3((y_scen - y_today) * field.area_ha), "USD/year"),
        other_heat_response=other_hr, other_heat_response_change_usd_ha=round(other_change),
        best_alternative=best,
        sentence=s.climate_bill(yours.name, label, change.p50, best.name if best else None,
                                best.wins_back_usd_ha if best else None, best.wins_back_share if best else None,
                                req.units),
        sources=sources,
    )

    # 4b. Bad-year money, scenario run.
    bad_years = []
    for r in priced:
        sm = season_m(scen, r)
        cushion = money.cash_cushion(sm)
        share = money.losing_season_share(sm)
        worst = float(sm.min())
        bad_years.append(BadYears(
            rotation_id=r.id, name=r.name,
            annual_margin=_stat(money.p3(money.annual_margins(sm, sc.years)), USD_HA_YEAR),
            season_margin=_stat(money.p3(sm.ravel()), "USD/ha"),
            seasons_total=int(sm.shape[0]), losing_season_share=round(share, 3),
            losing_runs=money.losing_runs(sm), runs=int(sm.shape[1]),
            worst_season_usd_ha=round(worst), cash_cushion_worst_usd_ha=round(float(cushion.max())),
            cash_cushion_typical_usd_ha=round(float(np.median(cushion))),
            sentence=s.bad_years(r.name, share, worst, float(cushion.max()), req.units),
        ))

    # 4c. Who earns most.
    grid = None
    if len(priced) >= 2:
        if proj:
            grid_rain = float(np.clip(proj.rain_change_pct, -50.0, 30.0))
            rain_source = "the projection's May-Sep median rain change"
            warm_now = proj.temp_change_c
        else:
            grid_rain, rain_source, warm_now = sc.rain_change_pct, "the scenario's rain change", sc.temp_delta_c
        cols = req.grid.price_change_pct
        cells, winners = [], []
        for w in req.grid.warming_c:
            run = runs.get(sc.model_copy(update={"temp_delta_c": w, "rain_change_pct": grid_rain, "projection": None}))
            row, row_w = [], []
            for col in cols:
                p50s = {r.id: money.p3(annual(run, r, col)).p50 for r in priced}
                winner, tie = money.grid_winner(p50s, p.NEAR_TIE_USD_HA)
                row.append(GridCell(winner_rotation_id=winner, near_tie=tie,
                                    margin_p50_usd_ha={k: round(v) for k, v in p50s.items()}))
                row_w.append(winner)
            cells.append(row)
            winners.append(row_w)
        ri = min(range(len(req.grid.warming_c)), key=lambda i: abs(req.grid.warming_c[i] - warm_now))
        ci = min(range(len(cols)), key=lambda i: abs(cols[i] - req.price_change_pct))
        # A projection's monthly changes are never exactly a uniform grid row.
        exact = proj is None and req.grid.warming_c[ri] == warm_now and cols[ci] == req.price_change_pct
        sp = money.switch_points(winners, req.grid.warming_c, cols, yours.id)
        grid = WhoEarnsMost(
            warming_c=req.grid.warming_c, price_change_pct=cols, price_crop=req.price_crop,
            rain_change_pct=grid_rain, rain_change_source=rain_source, cells=cells,
            your_cell=YourCell(row=ri, col=ci, exact=exact),
            sentence=s.switch(sp, {r.id: r.name for r in priced}, yours.id),
        )

    # 5. Notes and assumptions.
    notes = [s.CAVEAT, s.OWN_LAND if req.your_numbers.land == "own" else s.RENT_LAND]
    if not scen.calibrated:
        notes.append(s.NOT_CALIBRATED)
    if scen.data_note:
        notes.append(scen.data_note)

    yn = req.your_numbers
    assumptions = []
    if "oats" in used_crops and "oats" not in yn.costs_before_rent_usd_ha:
        assumptions.append(Assumption(topic="Oats cost", text="Iowa State publishes no grain-oat budget, so the oats "
                                      "cost is an estimate.", source=p.CROP_MONEY["oats"].sources["cost"]))
    if sc.irrigation != "none":
        if yn.irrigation_usd_per_mm_ha is None:
            assumptions.append(Assumption(topic="Irrigation cost", text="Pumping and energy per mm of water.",
                                          source=p.IRRIGATION_SOURCE))
        assumptions.append(Assumption(
            topic="Irrigation per weather year",
            text="The Simulator reports each season's irrigation as a range, not per weather year, so every weather "
                 "year is charged the season's typical (median) irrigation.",
            source="ASSUME: season median irrigation used for every track (docs/modules/economics.md section 6.6)"))
    if any(r.cover_crop for r in priced) and yn.cover_crop_usd_ha is None:
        assumptions.append(Assumption(topic="Cover crop cost", text="Rye seed and seeding, charged every priced season.",
                                      source=p.COVER_CROP_SOURCE))
    if grid is not None:
        assumptions.append(Assumption(topic="Too close to call",
                                      text=f"Two rotations within ${p.NEAR_TIE_USD_HA:.0f}/ha a year of each other "
                                           f"count as a near tie, with no winner.", source=p.NEAR_TIE_SOURCE))
    if yours_assumed:
        assumptions.append(Assumption(topic="Your rotation", text=f"No rotations were given, so {yours.name} is taken "
                                      f"as yours.", source=p.DEFAULT_YOURS_SOURCE))

    return EconomicsReport(
        farm_id=farm_id, field_id=field.field_id, field_name=field.name,
        area=Area(value_ha=field.area_ha, source="CropTwin: field boundary area"),
        scenario=sc, scenario_label=label, price_change_pct=req.price_change_pct, price_crop=req.price_crop,
        units=req.units, yours_rotation_id=yours.id, yours_assumed=yours_assumed,
        climate_bill=bill, bad_years=bad_years, who_earns_most=grid, inputs_used=inputs_used,
        excluded_rotations=excluded, assumptions=assumptions, notes=notes, calibrated=scen.calibrated,
        ensemble_size=len(scen.ensemble_start_years), ensemble_start_years=scen.ensemble_start_years,
        data_note=scen.data_note, simulator_model_version=scen.model_version,
    )
