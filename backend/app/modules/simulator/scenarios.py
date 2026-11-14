"""Scenarios: perturb observed weather, presets, and climate summaries."""
from __future__ import annotations

import numpy as np

from .engine.et0 import climate_et0
from .engine.types import Climate
from .projections import MONTH_OF_DAY
from .schemas import ClimateSummary, Kind, Scenario, ScenarioPreset, YearClimate

MAY_1, OCT_1 = 120, 273  # day-of-year indices (0-based) of the growing-season summary window
HOT_DAY_C = 35.0


def apply(climate: Climate, scenario: Scenario, deltas: dict[str, np.ndarray] | None = None) -> Climate:
    """Shift observed weather.

    With `deltas` (a NEX-GDDP-CMIP6 projection): each calendar month gets the model ensemble's change
    in Tmax and Tmin and its percent change in rain. Otherwise uniform shifts from the sliders: +dT on
    Tmax and Tmin every day, rain scaled by (1 + dR). Either way, wet-day frequency, humidity, wind and
    radiation stay as observed.
    """
    if deltas is not None:
        m = MONTH_OF_DAY
        return climate.with_arrays(tmax_c=climate.tmax_c + deltas["tasmax"][m], tmin_c=climate.tmin_c + deltas["tasmin"][m],
                                   rain_mm=climate.rain_mm * np.maximum(1 + deltas["pr_pct"][m] / 100, 0.0))
    if scenario.temp_delta_c == 0 and scenario.rain_change_pct == 0:
        return climate
    dt = scenario.temp_delta_c
    return climate.with_arrays(tmax_c=climate.tmax_c + dt, tmin_c=climate.tmin_c + dt,
                               rain_mm=climate.rain_mm * (1 + scenario.rain_change_pct / 100))


def summarise(climate: Climate, et0: np.ndarray, kind: Kind) -> ClimateSummary:
    season = slice(MAY_1, OCT_1)
    rain = climate.rain_mm[:, season].sum(axis=1)
    driest = int(np.argmin(rain))
    return ClimateSummary(
        kind=kind,
        source=climate.source if kind == "observed" else f"{climate.source}, shifted by the scenario",
        growing_season_rain_mm=round(float(rain.mean()), 1),
        growing_season_tmax_c=round(float(climate.tmax_c[:, season].mean()), 1),
        growing_season_et0_mm=round(float(et0[:, season].sum(axis=1).mean()), 1),
        hot_days_per_year=round(float((climate.tmax_c[:, season] >= HOT_DAY_C).sum(axis=1).mean()), 1),
        driest_year=climate.years[driest],
        driest_year_rain_mm=round(float(rain[driest]), 1),
    )


def yearly(observed: Climate, scenario: Climate) -> list[YearClimate]:
    season = slice(MAY_1, OCT_1)
    out = []
    for i, year in enumerate(observed.years):
        out.append(YearClimate(
            year=year,
            rain_mm=round(float(observed.rain_mm[i, season].sum()), 1),
            scenario_rain_mm=round(float(scenario.rain_mm[i, season].sum()), 1),
            tmax_c=round(float(observed.tmax_c[i, season].mean()), 1),
            scenario_tmax_c=round(float(scenario.tmax_c[i, season].mean()), 1),
            hot_days=int((observed.tmax_c[i, season] >= HOT_DAY_C).sum()),
            scenario_hot_days=int((scenario.tmax_c[i, season] >= HOT_DAY_C).sum()),
        ))
    return out


def et0_for(climate: Climate) -> np.ndarray:
    return climate_et0(climate)


PRESETS: list[ScenarioPreset] = [
    ScenarioPreset(id="today", name="Today's climate", scenario=Scenario()),
    ScenarioPreset(id="hot_dry", name="Hotter and drier", scenario=Scenario(temp_delta_c=2.0, rain_change_pct=-20)),
    ScenarioPreset(id="severe", name="Severe heat and drought", scenario=Scenario(temp_delta_c=4.0, rain_change_pct=-30)),
    ScenarioPreset(id="warm_wet", name="Warmer and wetter", scenario=Scenario(temp_delta_c=1.5, rain_change_pct=10)),
]
