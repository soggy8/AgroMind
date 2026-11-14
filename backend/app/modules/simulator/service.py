"""Simulator orchestration. The only file other modules may import."""
from __future__ import annotations

from dataclasses import dataclass, replace
from functools import lru_cache

import numpy as np
from sqlalchemy.orm import Session

from . import advisor, ports, projections, ranking, rotations, scenarios, store
from . import units as u
from .economics import costs, revenue
from .engine import crop_models, runner, soil_health
from .engine.types import Climate, EnsembleOutcome, FieldSnapshot
from .parameters import (COVER_CROP_SOURCES, CROPS, HEAT_LOSS_PER_DEGDAY, IRRIGATION_COST_SOURCE,
                         IRRIGATION_COST_USD_PER_MM_HA, MODEL_VERSION, STRESS_SEASON_THRESHOLD, WARMING_K_PER_DD)
from .schemas import (AdvisorContext, Assumption, CropOption, Economics, FarmInfo, FieldOption, FinderRequest,
                      FinderResult, IrrigationPlan, IrrigationPlanRequest, IrrigationPoint, Priorities, ProjectionInfo,
                      RotationInput, RotationResult, SavedRun, SavedRunSummary, Scenario, SeasonResult,
                      SimulationRequest, SimulationResult, SimulatorOptions, SoilIndex, Stat, VsBaseline)

# Re-exported so the router can map them to HTTP errors.
NotFound = ports.NotFound
WeatherUnavailable = ports.WeatherUnavailable
InvalidRotation = rotations.InvalidRotation


# ---------- options ----------

def get_options(session: Session, farm_id: str) -> SimulatorOptions:
    farm = ports.get_farm(session, farm_id)
    calibrated = farm.center is not None and ports.water_storage_scale(*farm.center) != 1.0
    return SimulatorOptions(
        farm=FarmInfo(id=farm.id, name=farm.name, region=farm.region, center=farm.center),
        fields=[FieldOption(id=f.id, name=f.name, crop_id=f.crop_id, area_ha=f.area_ha, boundary=list(f.boundary),
                            soil=f.soil.description, irrigation_available=f.irrigation_available)
                for f in farm.fields],
        weather_source=f"NASA POWER daily (MERRA-2, CERES), {ports.FIRST_YEAR}-{ports.LAST_YEAR}",
        calibration_note=("Calibrated against USDA NASS Story County maize yields, 2001-2025." if calibrated
                          else "Outside the calibrated area: results are uncalibrated."),
        crops=[CropOption(id=c.id, name=c.name, family=c.family, season=rotations.season_label(c.id),  # type: ignore[arg-type]
                          notes=None if c.typical_yield_t_ha else "Relative yield only, no economics")
               for c in CROPS.values()],
        suggested_rotations=rotations.SUGGESTED,
        scenario_presets=scenarios.PRESETS,
        default_priorities=Priorities.model_validate(farm.priorities),
        default_irrigation="none",
        projections=[ProjectionInfo(**o) for o in projections.options(*farm.center)] if farm.center else [],
        projection_source="NASA NEX-GDDP-CMIP6 (Thrasher et al. 2022), monthly changes 1995-2014 to future periods",
    )


# ---------- cached building blocks ----------

_ET0_CACHE: dict[tuple, np.ndarray] = {}


def _et0_for(climate: Climate, scenario_key: tuple) -> np.ndarray:
    """ET0 depends only on the weather, so cache it per location and scenario shift."""
    key = (climate.source, climate.latitude, scenario_key)
    if key not in _ET0_CACHE:
        if len(_ET0_CACHE) > 64:
            _ET0_CACHE.clear()
        _ET0_CACHE[key] = scenarios.et0_for(climate)
    return _ET0_CACHE[key]


@lru_cache(maxsize=64)
def _typical_factors(field: FieldSnapshot, crop_ids: tuple[str, ...]) -> dict[str, float]:
    climate, _ = ports.load_climate(field.latitude, field.longitude)
    return runner.typical_factors(field.soil, climate, _et0_for(climate, ()), crop_ids,
                                  root_depth_scale=field.water_storage_scale)


# ---------- shared preparation ----------

@dataclass
class _Context:
    farm: ports.FarmView
    field: FieldSnapshot
    climate: Climate
    scen_climate: Climate
    et0_base: np.ndarray
    et0_scen: np.ndarray
    data_note: str
    projection: ProjectionInfo | None

    @property
    def scenario_applied(self) -> bool:
        return self.scen_climate is not self.climate


def _prepare(session: Session, farm_id: str, field_id: str, sc: Scenario) -> _Context:
    farm = ports.get_farm(session, farm_id)
    field = ports.load_field(session, farm_id, field_id)
    climate, data_note = ports.load_climate(field.latitude, field.longitude)
    projection = deltas = None
    if sc.projection:
        deltas = projections.monthly_deltas(field.latitude, field.longitude, sc.projection)
        info = next((o for o in projections.options(field.latitude, field.longitude) if o["id"] == sc.projection), None)
        if deltas is None or info is None:
            raise InvalidRotation(f"No saved climate projection '{sc.projection}' for this location.")
        projection = ProjectionInfo(**info)
    scen_climate = scenarios.apply(climate, sc, deltas)
    et0_base = _et0_for(climate, ())
    scen_key = (sc.projection,) if sc.projection else (sc.temp_delta_c, sc.rain_change_pct)
    et0_scen = _et0_for(scen_climate, scen_key) if scen_climate is not climate else et0_base
    return _Context(farm, field, climate, scen_climate, et0_base, et0_scen, data_note, projection)


def _simulate(ctx: _Context, crops: list[str], sc: Scenario, cover_crop: bool, typical: dict[str, float], *,
              irrigation: str | None = None, cap: float | None = None,
              name: str = "") -> tuple[EnsembleOutcome, EnsembleOutcome, EnsembleOutcome]:
    """One rotation: (result with the chosen heat response, today's climate, the other heat response)."""
    plantings = rotations.schedule(crops, sc.years, ctx.field.previous_crop_id)
    if not plantings:
        raise InvalidRotation(f"'{name or rotations.rotation_name(crops)}' doesn't fit a single season into "
                              f"{sc.years} year(s). Add years.")
    kw = dict(years=sc.years, irrigation=irrigation or sc.irrigation,
              irrigation_cap_mm=cap if irrigation else sc.irrigation_cap_mm,
              typical_factor=typical, root_depth_scale=ctx.field.water_storage_scale, cover_crop=cover_crop)
    local = runner.run(ctx.field.soil, plantings, ctx.scen_climate, ctx.et0_scen, **kw)
    base = local if not ctx.scenario_applied else runner.run(ctx.field.soil, plantings, ctx.climate, ctx.et0_base, **kw)
    published = _with_published_warming(local, base)
    return (published, base, local) if sc.heat_response == "published" else (local, base, published)


def _notes(ctx: _Context, rotation_results: list[RotationResult], include_economics: bool) -> str:
    notes = [ctx.data_note]
    if ctx.projection:
        notes.append(f"Scenario: NASA NEX-GDDP-CMIP6 {ctx.projection.ssp_name}, {ctx.projection.years}, median of "
                     f"{ctx.projection.models} climate models, applied to observed 2001-2025 weather.")
    notes.append("Model estimates, not forecasts: results show how each rotation responds to past weather "
                 "shifted by the scenario.")
    if not ctx.field.calibrated:
        notes.append("This location is outside the calibrated area, so results are uncalibrated.")
    if include_economics and any(r.economics is None for r in rotation_results):
        missing = sorted({CROPS[c].name for r in rotation_results for c in r.crops if not revenue.has_economics(c)})
        notes.append("Economics left out: " + ", ".join(missing) + " have no cost data.")
    return " ".join(notes)


# ---------- the run ----------

def run_simulation(session: Session, farm_id: str, req: SimulationRequest) -> SimulationResult:
    for rot in req.rotations:
        rotations.validate(rot.crops)
    if len({r.id for r in req.rotations}) != len(req.rotations):
        raise InvalidRotation("Rotation ids must be unique.")
    sc = req.scenario
    ctx = _prepare(session, farm_id, req.field_id, sc)
    priorities = req.priorities or Priorities.model_validate(ctx.farm.priorities)
    all_crops = tuple(sorted({c for r in req.rotations for c in r.crops}))
    typical = _typical_factors(ctx.field, all_crops)

    results = []
    for idx, rot in enumerate(req.rotations):
        main, base, other = _simulate(ctx, rot.crops, sc, rot.cover_crop, typical, name=rot.name)
        results.append(_rotation_result(idx, rot, main, base, other, sc.years, req.include_economics,
                                        sc.price_change_pct))

    ordered, recommendation = ranking.rank(results, priorities, req.include_economics, req.units)
    return SimulationResult(
        field_id=ctx.field.field_id, field_name=ctx.field.name, soil=ctx.field.soil.description,
        calibrated=ctx.field.calibrated, scenario=sc, priorities=priorities,
        baseline_climate=scenarios.summarise(ctx.climate, ctx.et0_base, "observed"),
        scenario_climate=scenarios.summarise(ctx.scen_climate, ctx.et0_scen, "scenario"),
        rotations=ordered, recommendation=recommendation,
        assumptions=_assumptions(ctx, all_crops, req, any(r.cover_crop for r in req.rotations)),
        ensemble_size=ctx.climate.n_years, ensemble_start_years=list(ctx.climate.years),
        yearly_climate=scenarios.yearly(ctx.climate, ctx.scen_climate), projection=ctx.projection,
        economics_included=req.include_economics and all(r.economics is not None for r in ordered),
        data_note=_notes(ctx, ordered, req.include_economics), model_version=MODEL_VERSION,
    )


# ---------- rotation finder ----------

def candidate_rotations(crops: list[str], max_length: int) -> list[list[str]]:
    """Every distinct crop cycle up to max_length: continuous crops, and cycles where no crop follows itself.

    Cycles are deduplicated up to rotation (maize-soybean == soybean-maize), keeping the order that
    starts with the earliest crop in the catalogue.
    """
    order = {c: i for i, c in enumerate(CROPS)}
    seen, out = set(), []

    def canonical(seq):
        rots = [tuple(seq[i:] + seq[:i]) for i in range(len(seq))]
        return min(rots, key=lambda r: [order[c] for c in r])

    def extend(seq):
        if seq:
            ok = len(seq) == 1 or all(a != b for a, b in zip(seq, seq[1:] + seq[:1]))
            key = canonical(seq)
            if ok and key not in seen:
                seen.add(key)
                out.append(list(key))
        if len(seq) < max_length:
            for c in crops:
                extend(seq + [c])

    extend([])
    return out


def find_rotations(session: Session, farm_id: str, req: FinderRequest) -> FinderResult:
    # With economics on, only crops that have Iowa prices and costs can be compared fairly on margin.
    crops = req.crops or [c for c in CROPS if not req.include_economics or revenue.has_economics(c)]
    rotations.validate(crops)
    sc = req.scenario
    ctx = _prepare(session, farm_id, req.field_id, sc)
    priorities = req.priorities or Priorities.model_validate(ctx.farm.priorities)
    typical = _typical_factors(ctx.field, tuple(sorted(set(crops))))
    results = []
    for idx, cycle in enumerate(candidate_rotations(crops, req.max_length)):
        rot = RotationInput(id=f"R{idx + 1}", name=rotations.rotation_name(cycle), crops=cycle, cover_crop=req.cover_crop)
        try:
            main, base, other = _simulate(ctx, cycle, sc, req.cover_crop, typical)
        except InvalidRotation:
            continue  # e.g. a winter-wheat cycle that doesn't fit the horizon
        results.append(_rotation_result(idx, rot, main, base, other, sc.years, req.include_economics,
                                        sc.price_change_pct, slim=True))
    ordered, recommendation = ranking.rank(results, priorities, req.include_economics, req.units)
    top = ordered[:req.top]
    for i, r in enumerate(top):
        r.input_index = i
    return FinderResult(candidates_tested=len(results), rotations=top, recommendation=recommendation,
                        data_note=_notes(ctx, top, req.include_economics))


# ---------- irrigation planner ----------

IRRIGATION_CAPS: tuple[float | None, ...] = (0, 25, 50, 75, 100, 150, 200, 300, None)


def plan_irrigation(session: Session, farm_id: str, req: IrrigationPlanRequest) -> IrrigationPlan:
    rotations.validate(req.rotation.crops)
    sc = req.scenario
    ctx = _prepare(session, farm_id, req.field_id, sc)
    typical = _typical_factors(ctx.field, tuple(sorted(set(req.rotation.crops))))
    points = []
    for cap in IRRIGATION_CAPS:
        mode = "none" if cap == 0 else ("full" if cap is None else "limited")
        main, _, _ = _simulate(ctx, req.rotation.crops, sc, req.rotation.cover_crop, typical,
                               irrigation=mode, cap=cap, name=req.rotation.name)
        per_track = main.relative_yield.mean(axis=0)
        irr = float(np.median(main.irrigation_mm.sum(axis=0) / sc.years))
        points.append(IrrigationPoint(
            cap_mm=cap, relative_yield=_stat(per_track, "share of typical"), irrigation_mm_per_year=round(irr, 0),
            water_cost_per_ha_year=round(irr * IRRIGATION_COST_USD_PER_MM_HA, 0),
            stress_season_frequency=round(float((main.relative_yield < STRESS_SEASON_THRESHOLD).mean()), 4)))
    target = req.target_share
    hit = next((p for p in points if p.relative_yield.p50 >= target), None)
    pct = f"{target * 100:.0f}%"
    if hit is None:
        best = points[-1].relative_yield.p50
        summary = (f"Even unlimited irrigation keeps {req.rotation.name} at only {best * 100:.0f}% of typical yield in this "
                   f"scenario, below the {pct} target: heat, not water, is the limit.")
    elif hit.cap_mm == 0:
        summary = f"{req.rotation.name} stays at or above {pct} of typical yield without irrigation in this scenario."
    else:
        cap_text = "unlimited irrigation" if hit.cap_mm is None else f"up to {u.water(hit.cap_mm, req.units)} per season"
        summary = (f"{req.rotation.name} needs {cap_text} to stay at {pct} of typical yield: about "
                   f"{u.water(hit.irrigation_mm_per_year, req.units)} a year on average, costing about "
                   f"{u.money_per_area(hit.water_cost_per_ha_year, req.units)} in pumping and energy.")
    return IrrigationPlan(rotation_name=req.rotation.name, target_share=target, points=points,
                          recommended_cap_mm=None if hit is None else hit.cap_mm, reaches_target=hit is not None,
                          summary=summary, cost_source=IRRIGATION_COST_SOURCE)


def _with_published_warming(o: EnsembleOutcome, base: EnsembleOutcome) -> EnsembleOutcome:
    """Apply the published US warming response to the heat the scenario adds over the same year today."""
    k = np.array([[WARMING_K_PER_DD[pl.crop_id]] for pl in o.plantings]).reshape(len(o.plantings), 1)
    f = crop_models.warming_factor(k, o.warming_degree_days - base.warming_degree_days)
    return replace(o, heat_factor=o.heat_factor * f, relative_yield=o.relative_yield * f)


def _stat(values: np.ndarray, unit: str, digits: int = 3) -> Stat:
    p10, p50, p90 = np.percentile(values, [10, 50, 90])
    return Stat(p10=round(float(p10), digits), p50=round(float(p50), digits), p90=round(float(p90), digits), unit=unit)


def _rotation_result(idx: int, rot: RotationInput, o: EnsembleOutcome, base: EnsembleOutcome,
                     other: EnsembleOutcome, years: int,
                     include_economics: bool, price_change_pct: float, slim: bool = False) -> RotationResult:
    """Summarise one rotation. `slim` skips the per-track detail (used for finder candidates)."""
    econ_ok = include_economics and all(revenue.has_economics(pl.crop_id) for pl in o.plantings)
    margins = None
    if econ_ok:
        rev = np.stack([revenue.season_revenue(pl.crop_id, o.relative_yield[i], price_change_pct)
                        for i, pl in enumerate(o.plantings)])
        covered = {pl.season_index for pl in runner.cover_crop_plantings(o.plantings)} if rot.cover_crop else set()
        cost = np.stack([costs.season_cost(pl.crop_id, pl.predecessor_crop_id, o.irrigation_mm[i],
                                           cover_crop=pl.season_index in covered)
                         for i, pl in enumerate(o.plantings)])
        margins = rev - cost

    seasons = []
    for i, pl in enumerate(o.plantings):
        crop = CROPS[pl.crop_id]
        factors = {"water": float(np.median(o.water_factor[i])), "heat": float(np.median(o.heat_factor[i])),
                   "rotation": float(o.rotation_factor[i, 0])}
        worst = min(factors, key=factors.get)  # type: ignore[arg-type]
        seasons.append(SeasonResult(
            season_index=i, crop_id=pl.crop_id, year=pl.harvest_day // 365 + 1,
            plant_date=rotations.day_label(pl.plant_day), harvest_date=rotations.day_label(pl.harvest_day),
            relative_yield=_stat(o.relative_yield[i], "share of typical"),
            yield_t_ha=_stat(o.relative_yield[i] * crop.typical_yield_t_ha, "t/ha", 2) if crop.typical_yield_t_ha else None,
            crop_water_need_mm=_stat(o.etc_mm[i], "mm", 0), rain_used_mm=_stat(o.eta_mm[i] - o.irrigation_mm[i], "mm", 0),
            irrigation_mm=_stat(o.irrigation_mm[i], "mm", 0),
            water_stress=_stat(1 - o.eta_mm[i] / np.maximum(o.etc_mm[i], 1e-9), "share"),
            heat_stress_days=_stat(o.heat_stress_days[i], "days", 1),
            limiting_factor=worst if factors[worst] < 0.95 else "none",  # type: ignore[arg-type]
            margin_per_ha=_stat(margins[i], "USD/ha", 0) if margins is not None else None,
        ))

    per_track_yield = o.relative_yield.mean(axis=0)
    base_yield = base.relative_yield.mean(axis=0)
    rain_suff = np.clip((o.eta_mm - o.irrigation_mm).sum(axis=0) / np.maximum(o.etc_mm.sum(axis=0), 1e-9), 0, 1)
    irr_year = o.irrigation_mm.sum(axis=0) / years
    stress = float((o.relative_yield < STRESS_SEASON_THRESHOLD).mean())
    base_stress = float((base.relative_yield < STRESS_SEASON_THRESHOLD).mean())

    economics = None
    if margins is not None:
        prices = {CROPS[c].economics.sources["price"] for c in rot.crops}  # type: ignore[union-attr]
        cost_src = {CROPS[c].economics.sources["cost"] for c in rot.crops}  # type: ignore[union-attr]
        economics = Economics(
            revenue_per_ha=_stat(rev.sum(axis=0) / years, "USD/ha/year", 0),
            cost_per_ha=_stat(cost.sum(axis=0) / years, "USD/ha/year", 0),
            margin_per_ha=_stat(margins.sum(axis=0) / years, "USD/ha/year", 0),
            currency="USD", price_source="; ".join(sorted(prices)), cost_source="; ".join(sorted(cost_src)),
            notes=["Costs include cash rent and labour, so margin is the return to management.",
                   "Averaged over all simulated years, including years between seasons."]
            + ([f"Prices shifted {price_change_pct:+.0f}% by the scenario."] if price_change_pct else []),
        )

    score, components, notes = soil_health.rotation_soil_index(rot.crops, rot.cover_crop)
    return RotationResult(
        rotation_id=rot.id, input_index=idx, name=rot.name, crops=rot.crops, seasons=seasons,
        relative_yield=_stat(per_track_yield, "share of typical"),
        irrigation_mm_per_year=_stat(irr_year, "mm/year", 0),
        rain_sufficiency=_stat(rain_suff, "share"),
        stress_season_frequency=round(stress, 4),
        by_start_year=[round(float(x), 3) for x in per_track_yield],
        track_seasons=[] if slim else np.round(o.relative_yield.T, 3).tolist(),
        cover_crop=rot.cover_crop,
        vs_baseline=VsBaseline(
            relative_yield_change_pct=round(float((per_track_yield.mean() / base_yield.mean() - 1) * 100), 1),
            irrigation_change_mm_per_year=round(float(irr_year.mean() - (base.irrigation_mm.sum(axis=0) / years).mean()), 1),
            stress_frequency_change=round(stress - base_stress, 4),
            other_heat_response_change_pct=round(
                float((other.relative_yield.mean(axis=0).mean() / base_yield.mean() - 1) * 100), 1),
        ),
        soil=SoilIndex(score=score, components=components, notes=notes),
        economics=economics, indicator_scores={}, score=0.0, rank=0,
    )


def _assumptions(ctx: _Context, crop_ids: tuple[str, ...], req: SimulationRequest, cover_crop: bool) -> list[Assumption]:
    field, scenario_applied = ctx.field, ctx.scenario_applied
    a = [
        Assumption(topic="Crop water use", text="Crop water need = crop coefficient x reference evapotranspiration "
                   "(Penman-Monteith), daily soil water balance.", source="FAO-56 Eq. 6, ch. 6 and 8"),
        Assumption(topic="Yield response to water", text="Yield falls with the seasonal shortfall of water use "
                   "against need, scaled by a crop factor Ky.", source="FAO-56 Eq. 90, Table 24"),
        Assumption(topic="Heat in today's weather", text=f"Mid-season days above the crop's heat threshold cost "
                   f"{HEAT_LOSS_PER_DEGDAY * 100:.1f}% yield per degree-day.",
                   source="Calibrated against USDA NASS Story County yields"),
        Assumption(topic="Soil water", text=f"{field.soil.description}: {field.soil.awc_mm_per_m:.0f} mm available "
                   f"water per metre of soil.", source=field.soil.source),
        Assumption(topic="Effective water storage",
                   text=(f"Rooting depths are scaled by {field.water_storage_scale:.1f} to stand in for subsoil water "
                         "and the water table, so modelled yield variability matches observed county yields."
                         if field.calibrated else "Uncalibrated: FAO rooting depths, no subsoil or water-table water."),
                   source="docs/modules/simulator_calibration.md"),
        Assumption(topic="Weather", text="Every result is repeated over each historical start year; ranges are "
                   "the 10th-90th percentile across those years. Parameter uncertainty is not included.",
                   source="NASA POWER daily, 2001-2025"),
        Assumption(topic="Typical yield", text="100% = the crop's average modelled yield under today's climate, "
                   "rain-fed, after a different crop.", source="Model definition"),
    ]
    if scenario_applied and req.scenario.heat_response == "published":
        a.append(Assumption(topic="Response to warming", text="Each extra degree-day above the crop's threshold "
                            "(29 C maize, 30 C others) that the scenario adds costs yield at a rate set so that +1 C "
                            "reproduces the published US average: maize -10.3%, soybean -6.8%, wheat and oats -5.5% "
                            "per C. This county's own history suggests a much smaller response; see the other setting.",
                            source="Zhao et al. (2017) PNAS 114:9326; Schlenker & Roberts (2009) PNAS 106:15594"))
    elif scenario_applied:
        a.append(Assumption(topic="Response to warming", text="Uses only this county's 2001-2025 history, which "
                            "shows a small response to heat (2012 lost about 12%). Published US averages are "
                            "several times larger; see the other setting.",
                            source="Calibrated against USDA NASS Story County yields"))
    if ctx.projection:
        p = ctx.projection
        a.append(Assumption(topic="Climate projection", text=(
            f"{p.ssp_name}, {p.years}: each month's change in maximum and minimum temperature and percent change in "
            f"rain, median of {p.models} climate models (growing season {p.temp_change_c['median']:+.1f} C, range "
            f"{p.temp_change_c['min']:+.1f} to {p.temp_change_c['max']:+.1f}; rain {p.rain_change_pct['median']:+.0f}%), "
            "added to observed 2001-2025 weather. Changes are relative to 1995-2014, so warming already in the "
            "observed record is counted slightly twice. Days stay as observed, so changes in heatwave or "
            "downpour frequency beyond the monthly shift are not captured."),
            source="NASA NEX-GDDP-CMIP6 v2.0 (Thrasher et al. 2022, Sci. Data 9:262)"))
    elif scenario_applied:
        a.append(Assumption(topic="Scenario", text="Temperature is added to every day and rain is scaled on every "
                            "wet day. Humidity, wind and sunshine stay as observed. Not a climate projection.",
                            source="Scenario definition"))
    if cover_crop:
        a.append(Assumption(topic="Cover crop", text="Cereal rye from fall harvest to 14 days before spring planting. "
                            + COVER_CROP_SOURCES["water"].removeprefix("ASSUME: ") + "; " + COVER_CROP_SOURCES["maize"]
                            + " " + COVER_CROP_SOURCES["cost"].removeprefix("ASSUME: ") + ". +15 soil index points.",
                            source="Practical Farmers of Iowa; Iowa State University; AgroMind assumptions"))
    for cid in crop_ids:
        crop = CROPS[cid]
        flagged = [f"{k.replace('_', ' ')}: {v}" for k, v in crop.sources.items() if v.startswith(("ASSUME", "PROXY"))]
        if flagged:
            a.append(Assumption(topic=f"{crop.name} parameters", text="; ".join(flagged), source="AgroMind assumption"))
    if req.include_economics:
        a.append(Assumption(topic="Prices and costs", text="2026/27 projected farm prices and 2026 Iowa cost budgets. "
                            + IRRIGATION_COST_SOURCE.removeprefix("ASSUME: "),
                            source="USDA WASDE Nov 2026; ISU Ag Decision Maker A1-20 (2026)"))
    if req.scenario.irrigation != "none" and not field.irrigation_available:
        a.append(Assumption(topic="Irrigation", text="The field has no irrigation recorded; irrigation here is "
                            "hypothetical.", source="Scenario input"))
    return a


# ---------- saved runs and advisor ----------

def save_run(session: Session, farm_id: str, name: str, request: SimulationRequest) -> SavedRun:
    return store.save(session, farm_id, name, request, run_simulation(session, farm_id, request))


def list_runs(session: Session, farm_id: str) -> list[SavedRunSummary]:
    ports.get_farm(session, farm_id)
    return store.list_runs(session, farm_id)


def get_run(session: Session, farm_id: str, run_id: str) -> SavedRun:
    run = store.get(session, farm_id, run_id)
    if run is None:
        raise NotFound(f"Unknown run '{run_id}'")
    return run


def delete_run(session: Session, farm_id: str, run_id: str) -> None:
    if not store.delete(session, farm_id, run_id):
        raise NotFound(f"Unknown run '{run_id}'")


def advisor_context(result: SimulationResult) -> AdvisorContext:
    return advisor.advisor_context(result)
