"""Orchestration: farm, samples and weather in; one FarmHealth out. The only file other modules may import."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import ports
from .anomalies import Scored, score_season, status
from .baselines import normal
from .explanations import find
from .indicators.vegetation import Reading, period_end, period_start, visible_from
from .indicators.weather import WeatherValue, weather_values
from .parameters import ASSUMPTIONS, DEMO_AS_OF, WEATHER_WINDOW_DAYS
from .ports import DataUnavailable, FarmInfo, FieldInfo, NotFound
from .schemas import (Assumption, Crop, Explanation, FarmHealth, FarmRef, FieldHealth, Finding, Indicator,
                      SeasonPoint, Soil, Value)

__all__ = ["NotFound", "DataUnavailable", "InvalidDate", "get_health"]

GREENNESS_SOURCE = "MODIS MOD13Q1/MYD13Q1 v6.1 (NASA LP DAAC) via Microsoft Planetary Computer"
POWER_SOURCE = "NASA POWER daily (MERRA-2)"
ET0_SOURCE = "FAO-56 Penman-Monteith from NASA POWER weather"
CROP_MAP_SOURCE = "USDA Cropland Data Layer"
PROFILE_SOURCE = "Farm profile"
DEMO_NOTE = ("Demo farm with sample data. Observed values come from NASA satellites and NASA POWER; "
             "Modelled values are estimates.")
OTHER_NOTE = ("Rain, daily highs and water demand come from NASA POWER weather for this farm's location. "
              "Greenness isn't available for this farm yet.")
NO_GREENNESS = "Greenness isn't available for this farm yet."
PAUSED_NOTE = "Stress checks are paused: this field is not normally at full canopy at this time of year."

# id, label, unit, kind, source, WeatherValue key, diff unit
_WEATHER = (
    ("rain_30d", "Rainfall, 30 days", "mm", "observed", POWER_SOURCE, "rain_mm", "%"),
    ("tmax_30d", "Daily high, 30-day mean", "°C", "observed", POWER_SOURCE, "tmax_c", "°C"),
    ("et0_30d", "Water demand (ET0)", "mm/day", "modelled", ET0_SOURCE, "et0_mm", "%"),
)


class InvalidDate(ValueError):
    pass


def _fmt(d: date) -> str:
    return f"{d.day} {d:%b} {d.year}"


def _r(x: float | None, n: int) -> float | None:
    return None if x is None else round(x, n)


def _weather_indicators(values: dict[str, WeatherValue]) -> list[Indicator]:
    out = []
    for id_, label, unit, kind, source, key, diff_unit in _WEATHER:
        wv = values[key]
        n = wv.normal
        out.append(Indicator(id=id_, label=label, value=Value(
            value=_r(wv.value, 2), unit=unit, kind=kind, source=source,
            period_start=None if wv.end is None else wv.end - timedelta(days=WEATHER_WINDOW_DAYS - 1),
            period_end=wv.end,
            normal=_r(n.mean, 2) if n else None, normal_low=_r(n.low, 2) if n else None,
            normal_high=_r(n.high, 2) if n else None, normal_years=len(n.years) if n else None,
            diff=_r(wv.diff, 1), diff_unit=diff_unit if wv.diff is not None else None)))
    return out


def _greenness_indicator(s: Scored) -> Indicator:
    r, n = s.reading, s.normal
    return Indicator(id="greenness", label="Greenness (NDVI)", value=Value(
        value=_r(r.ndvi, 4), unit="", kind="observed", source=GREENNESS_SOURCE,
        period_start=period_start(r.year, r.doy), period_end=period_end(r.year, r.doy),
        normal=_r(n.mean, 4) if n else None, normal_low=_r(n.low, 4) if n else None,
        normal_high=_r(n.high, 4) if n else None, normal_years=len(n.years) if n else None,
        diff=_r(s.diff_pct, 1), diff_unit="%" if s.diff_pct is not None else None))


def _crop(f: FieldInfo, as_of: date, today: date) -> Crop | None:
    if as_of.year == today.year and f.crop_id:
        return Crop(label=f.crop_id.replace("_", " ").capitalize(), year=None, kind=None, source=PROFILE_SOURCE)
    label = ports.load_crops(f.id).get(as_of.year)
    return Crop(label=label, year=as_of.year, kind="modelled", source=CROP_MAP_SOURCE) if label else None


def _soil(f: FieldInfo) -> Soil:
    return Soil(texture=f.soil_texture, sand_pct=f.sand_pct, silt_pct=f.silt_pct, clay_pct=f.clay_pct,
                ph=f.ph, depth=f.soil_depth, source=f.soil_source)


def _season(readings: list[Reading], scored: list[Scored], year: int, as_of: date) -> list[SeasonPoint]:
    by_doy: dict[int, dict[int, float | None]] = {}
    for r in readings:
        by_doy.setdefault(r.doy, {})[r.year] = r.ndvi
    shown = {s.reading.doy: s for s in scored}
    out = []
    for doy in sorted(d for d, ys in by_doy.items() if year in ys):
        ys = by_doy[doy]
        n = normal(ys, year)
        s = shown.get(doy)
        out.append(SeasonPoint(
            doy=doy, start=period_start(year, doy),
            this_year=_r(ys[year], 4) if visible_from(year, doy) <= as_of else None,
            last_year=_r(ys.get(year - 1), 4), two_years_ago=_r(ys.get(year - 2), 4),
            normal=_r(n.mean, 4) if n else None, normal_low=_r(n.low, 4) if n else None,
            normal_high=_r(n.high, 4) if n else None,
            diff_pct=_r(s.diff_pct, 1) if s else None, low=bool(s and s.low)))
    return out


def _field_health(f: FieldInfo, as_of: date, today: date, wvalues: dict[str, WeatherValue],
                  weather: list[Indicator], demo: bool) -> tuple[FieldHealth, Finding | None]:
    base = dict(id=f.id, name=f.name, boundary=list(f.boundary), area_ha=f.area_ha,
                crop=_crop(f, as_of, today), soil=_soil(f), season_year=as_of.year)
    if not demo:
        return FieldHealth(**base, status="no_data", status_note=NO_GREENNESS, greenness=None, season=[]), None
    readings = ports.load_greenness(f.id)
    scored = score_season(readings, as_of.year, as_of)
    st = status(scored)
    valued = [s for s in scored if s.reading.ndvi is not None]
    latest = valued[-1] if valued else None
    note = None
    if st == "paused":
        note = PAUSED_NOTE
    elif st == "no_data":
        note = "Not enough earlier years to compare." if latest else "No satellite reading for this date."
    elif latest is not scored[-1]:
        note = f"No clear image since {_fmt(period_end(latest.reading.year, latest.reading.doy))}."
    greenness = _greenness_indicator(latest) if latest else None
    finding = None
    found = find(scored, wvalues)
    if found:
        finding = Finding(
            field_id=f.id, field_name=f.name, severity=found.severity, headline=found.headline,
            since=found.since, summary=found.summary,
            explanations=[Explanation(id=e.id, text=e.text, check=e.check) for e in found.explanations],
            caveat=found.caveat, evidence=[greenness, weather[0], weather[1]])
    return FieldHealth(**base, status=st, status_note=note, greenness=greenness,
                       season=_season(readings, scored, as_of.year, as_of)), finding


def get_health(session: Session, farm_id: str, as_of: date | None = None, today: date | None = None) -> FarmHealth:
    today = today or date.today()
    farm: FarmInfo = ports.get_farm(session, farm_id)
    demo = ports.has_sample(f.id for f in farm.fields)
    as_of = as_of or (DEMO_AS_OF if demo else today)
    if as_of > today:
        raise InvalidDate("That date is in the future.")
    wvalues: dict[str, WeatherValue] = {}
    weather: list[Indicator] = []
    if farm.center is not None:
        wvalues = weather_values(ports.weather_for(farm.center[0], farm.center[1], as_of), as_of)
        weather = _weather_indicators(wvalues)
    fields, findings = [], []
    for f in farm.fields:
        health, finding = _field_health(f, as_of, today, wvalues, weather, demo)
        fields.append(health)
        if finding:
            findings.append(finding)
    sources = ([GREENNESS_SOURCE] if demo else []) + ([POWER_SOURCE, ET0_SOURCE] if farm.fields else [])
    sources += sorted({f.crop.source for f in fields if f.crop})
    sources += sorted({f.soil.source for f in fields if f.soil.source})
    return FarmHealth(
        farm=FarmRef(id=farm.id, name=farm.name, region=farm.region, center=farm.center),
        as_of=as_of, today=today, is_replay=as_of < today, replay_date=DEMO_AS_OF if demo else None,
        data_note=DEMO_NOTE if demo else OTHER_NOTE, data_through=ports.data_through() if demo else None,
        greenness_available=demo, weather=weather, fields=fields, findings=findings,
        assumptions=[Assumption(topic=t, text=x, source=s) for t, x, s in ASSUMPTIONS], sources=sources)
