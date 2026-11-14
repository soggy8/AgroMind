"""Simulator orchestration. The only file other modules may import."""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from . import advisor, ports, ranking, rotations, scenarios, store
from .economics import costs, revenue
from .engine import runner, soil_health
from .engine.types import Climate, EnsembleOutcome, FieldSnapshot
from .parameters import (CROPS, HEAT_LOSS_PER_DEGDAY, IRRIGATION_COST_SOURCE, MODEL_VERSION,
                         STRESS_SEASON_THRESHOLD)
from .schemas import (AdvisorContext, Assumption, CropOption, Economics, FarmInfo, FieldOption, Priorities,
                      RotationInput, RotationResult, SavedRun, SavedRunSummary, SeasonResult, SimulationRequest,
                      SimulationResult, SimulatorOptions, SoilIndex, Stat, VsBaseline)

# Re-exported so the router can map them to HTTP errors.
NotFound = ports.NotFound
WeatherUnavailable = ports.WeatherUnavailable
InvalidRotation = rotations.InvalidRotation


# ---------- options ----------

def get_options(farm_id: str) -> SimulatorOptions:
    farm = ports.get_farm(farm_id)
    soil = ports.load_soil()
    climate, _ = ports.load_climate(*farm.center)
    return SimulatorOptions(
        farm=FarmInfo(id=farm.id, name=farm.name, region=farm.region, center=farm.center),
        fields=[FieldOption(id=f.id, name=f.name, crop_id=f.crop_id, area_ha=f.area_ha, boundary=list(f.boundary),
                            soil=soil.description, irrigation_available=f.irrigation_available)
                for f in farm.fields],
        weather_source=climate.source,
        calibration_note="Calibrated against USDA NASS Story County maize yields, 2001-2025.",
        crops=[CropOption(id=c.id, name=c.name, family=c.family, season=rotations.season_label(c.id),  # type: ignore[arg-type]
                          notes=None if c.typical_yield_t_ha else "Relative yield only, no economics")
               for c in CROPS.values()],
        suggested_rotations=rotations.SUGGESTED,
        scenario_presets=scenarios.PRESETS,
        default_priorities=Priorities.model_validate(farm.priorities),
        default_irrigation="none",
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


# ---------- the run ----------

def run_simulation(farm_id: str, req: SimulationRequest) -> SimulationResult:
    farm = ports.get_farm(farm_id)
    field = ports.load_field(farm_id, req.field_id)
    climate, data_note = ports.load_climate(field.latitude, field.longitude)
    for rot in req.rotations:
        rotations.validate(rot.crops)
    if len({r.id for r in req.rotations}) != len(req.rotations):
        raise InvalidRotation("Rotation ids must be unique.")

    sc = req.scenario
    priorities = req.priorities or Priorities.model_validate(farm.priorities)
    scen_key = (sc.temp_delta_c, sc.rain_change_pct)
    scen_climate = scenarios.apply(climate, sc)
    et0_base = _et0_for(climate, ())
    et0_scen = _et0_for(scen_climate, scen_key) if scen_climate is not climate else et0_base

    all_crops = tuple(sorted({c for r in req.rotations for c in r.crops}))
    typical = _typical_factors(field, all_crops)
    kwargs = dict(years=sc.years, irrigation=sc.irrigation, irrigation_cap_mm=sc.irrigation_cap_mm,
                  typical_factor=typical, root_depth_scale=field.water_storage_scale)

    results = []
    for idx, rot in enumerate(req.rotations):
        plantings = rotations.schedule(rot.crops, sc.years, field.previous_crop_id)
        if not plantings:
            raise InvalidRotation(f"'{rot.name}' doesn't fit a single season into {sc.years} year(s). Add years.")
        out_s = runner.run(field.soil, plantings, scen_climate, et0_scen, **kwargs)
        out_b = out_s if scen_climate is climate else runner.run(field.soil, plantings, climate, et0_base, **kwargs)
        results.append(_rotation_result(idx, rot, out_s, out_b, sc.years, req.include_economics, sc.price_change_pct))

    ordered, recommendation = ranking.rank(results, priorities, req.include_economics)
    notes = [data_note, "Model estimates, not forecasts: results show how each rotation responds to past weather "
                        "shifted by the scenario."]
    if not field.calibrated:
        notes.append("This location is outside the calibrated area, so results are uncalibrated.")
    if req.include_economics and any(r.economics is None for r in ordered):
        notes.append("Economics left out: " + ", ".join(sorted({CROPS[c].name for r in ordered for c in r.crops
                                                                if not revenue.has_economics(c)})) + " have no cost data.")
    return SimulationResult(
        field_id=field.field_id, field_name=field.name, soil=field.soil.description, calibrated=field.calibrated,
        scenario=sc, priorities=priorities,
        baseline_climate=scenarios.summarise(climate, et0_base, "observed"),
        scenario_climate=scenarios.summarise(scen_climate, et0_scen, "scenario"),
        rotations=ordered, recommendation=recommendation,
        assumptions=_assumptions(field, all_crops, req, scen_climate is not climate),
        ensemble_size=climate.n_years, ensemble_start_years=list(climate.years),
        economics_included=req.include_economics and all(r.economics is not None for r in ordered),
        data_note=" ".join(notes), model_version=MODEL_VERSION,
    )


def _stat(values: np.ndarray, unit: str, digits: int = 3) -> Stat:
    p10, p50, p90 = np.percentile(values, [10, 50, 90])
    return Stat(p10=round(float(p10), digits), p50=round(float(p50), digits), p90=round(float(p90), digits), unit=unit)


def _rotation_result(idx: int, rot: RotationInput, o: EnsembleOutcome, base: EnsembleOutcome, years: int,
                     include_economics: bool, price_change_pct: float) -> RotationResult:
    econ_ok = include_economics and all(revenue.has_economics(pl.crop_id) for pl in o.plantings)
    margins = None
    if econ_ok:
        rev = np.stack([revenue.season_revenue(pl.crop_id, o.relative_yield[i], price_change_pct)
                        for i, pl in enumerate(o.plantings)])
        cost = np.stack([costs.season_cost(pl.crop_id, pl.predecessor_crop_id, o.irrigation_mm[i])
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

    score, components, notes = soil_health.rotation_soil_index(rot.crops)
    return RotationResult(
        rotation_id=rot.id, input_index=idx, name=rot.name, crops=rot.crops, seasons=seasons,
        relative_yield=_stat(per_track_yield, "share of typical"),
        irrigation_mm_per_year=_stat(irr_year, "mm/year", 0),
        rain_sufficiency=_stat(rain_suff, "share"),
        stress_season_frequency=round(stress, 4),
        by_start_year=[round(float(x), 3) for x in per_track_yield],
        vs_baseline=VsBaseline(
            relative_yield_change_pct=round(float((per_track_yield.mean() / base_yield.mean() - 1) * 100), 1),
            irrigation_change_mm_per_year=round(float(irr_year.mean() - (base.irrigation_mm.sum(axis=0) / years).mean()), 1),
            stress_frequency_change=round(stress - base_stress, 4),
        ),
        soil=SoilIndex(score=score, components=components, notes=notes),
        economics=economics, indicator_scores={}, score=0.0, rank=0,
    )


def _assumptions(field: FieldSnapshot, crop_ids: tuple[str, ...], req: SimulationRequest, scenario_applied: bool) -> list[Assumption]:
    a = [
        Assumption(topic="Crop water use", text="Crop water need = crop coefficient x reference evapotranspiration "
                   "(Penman-Monteith), daily soil water balance.", source="FAO-56 Eq. 6, ch. 6 and 8"),
        Assumption(topic="Yield response to water", text="Yield falls with the seasonal shortfall of water use "
                   "against need, scaled by a crop factor Ky.", source="FAO-56 Eq. 90, Table 24"),
        Assumption(topic="Heat", text=f"Mid-season days above the crop's heat threshold cost "
                   f"{HEAT_LOSS_PER_DEGDAY * 100:.1f}% yield per degree-day.",
                   source="Calibrated against USDA NASS Story County yields; weakly constrained"),
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
    if scenario_applied:
        a.append(Assumption(topic="Scenario", text="Temperature is added to every day and rain is scaled on every "
                            "wet day. Humidity, wind and sunshine stay as observed. Not a climate projection.",
                            source="Scenario definition"))
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

def save_run(farm_id: str, name: str, request: SimulationRequest) -> SavedRun:
    return store.save(farm_id, name, request, run_simulation(farm_id, request))


def list_runs(farm_id: str) -> list[SavedRunSummary]:
    ports.get_farm(farm_id)
    return store.list_runs(farm_id)


def get_run(farm_id: str, run_id: str) -> SavedRun:
    run = store.get(farm_id, run_id)
    if run is None:
        raise NotFound(f"Unknown run '{run_id}'")
    return run


def delete_run(farm_id: str, run_id: str) -> None:
    if not store.delete(farm_id, run_id):
        raise NotFound(f"Unknown run '{run_id}'")


def advisor_context(result: SimulationResult) -> AdvisorContext:
    return advisor.advisor_context(result)
