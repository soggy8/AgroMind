"""Recent daily weather for a field from NASA POWER, for the farm profile.

CropTwin-local adapter (the pattern of soil_source.py); swap `_fetch` for app.shared.connectors.nasa_power when the
teammates' connector exists. POWER's Daily API (https://power.larc.nasa.gov/api/temporal/daily/point, v2.10.3)
declares no authentication in its OpenAPI document; the Simulator already uses it the same way.

What is shown and why it's labelled Modelled: POWER calls these "Analysis Ready Data"; the response header lists the
sources it used (for recent days, GEOSIT and FLASHFLUX). Units and long names come from the response, never from
here. POWER's fill value (-999) becomes "no value" (recent days often aren't processed yet).
Responses are cached in memory for six hours per point and date range. Tests use a saved response.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict
from datetime import date, timedelta

import httpx

from .schemas import WeatherOut, WeatherSeries

POWER_DAILY = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = ("PRECTOTCORR", "T2M_MAX", "T2M_MIN", "ALLSKY_SFC_SW_DWN")
CACHE_SECONDS = 6 * 3600
CACHE_SIZE = 128


class WeatherUnavailable(RuntimeError):
    pass


_lock = threading.Lock()
_cache: OrderedDict[tuple, tuple[float, dict]] = OrderedDict()


def recent_weather(lat: float, lon: float, days: int = 30, today: date | None = None) -> WeatherOut:
    """NASA POWER daily values for the `days` days up to yesterday (the server's date), cached for CACHE_SECONDS per point and date range. Raises WeatherUnavailable."""
    end = (today or date.today()) - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    key = (round(lat, 4), round(lon, 4), start, end)
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
            payload = hit[1]
        else:
            payload = None
    if payload is None:
        payload = _fetch(round(lat, 4), round(lon, 4), start, end)
        with _lock:
            _cache[key] = (time.monotonic(), payload)
            while len(_cache) > CACHE_SIZE:
                _cache.popitem(last=False)
    return _parse(payload)


def _fetch(lat: float, lon: float, start: date, end: date) -> dict:
    params = {"parameters": ",".join(PARAMETERS), "community": "AG", "latitude": f"{lat:.4f}",
              "longitude": f"{lon:.4f}", "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON"}
    try:
        r = httpx.get(POWER_DAILY, params=params, timeout=60)
    except httpx.HTTPError as e:
        raise WeatherUnavailable(f"Couldn't reach NASA POWER ({e.__class__.__name__}).") from e
    if r.status_code >= 400:
        raise WeatherUnavailable(f"NASA POWER answered {r.status_code}.")
    return r.json()


def _parse(payload: dict) -> WeatherOut:
    header = payload.get("header", {})
    fill = header.get("fill_value", -999.0)
    lon, lat = payload["geometry"]["coordinates"][:2]
    meta = payload.get("parameters", {})
    data = payload["properties"]["parameter"]
    series = []
    for pid in PARAMETERS:
        values = data.get(pid, {})
        days = sorted(values)
        series.append(WeatherSeries(
            id=pid, name=meta.get(pid, {}).get("longname", pid), units=meta.get(pid, {}).get("units", ""),
            dates=[f"{d[:4]}-{d[4:6]}-{d[6:]}" for d in days],
            values=[None if values[d] is None or values[d] == fill else values[d] for d in days],
        ))
    start, end = header.get("start", ""), header.get("end", "")
    return WeatherOut(
        source=f"{header.get('title', 'NASA POWER')} ({header.get('api', {}).get('name', 'POWER Daily API')} "
               f"{header.get('api', {}).get('version', '')})".replace(" )", ")"),
        sources=header.get("sources", []), latitude=lat, longitude=lon,
        start=f"{start[:4]}-{start[4:6]}-{start[6:]}" if start else None,
        end=f"{end[:4]}-{end[4:6]}-{end[6:]}" if end else None,
        time_standard=header.get("time_standard"), series=series)
