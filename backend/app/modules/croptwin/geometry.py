"""Field geometry from a GeoJSON polygon: validation, centroid and area.

Area uses a local equirectangular projection around the polygon's mean latitude. For a field a
few km across the error is well under 1%, which is below the uncertainty of a hand-drawn
boundary. Swap for PostGIS ST_Area(geography) if fields ever get large.
"""
from __future__ import annotations

import math

M_PER_DEG_LAT = 110_574
M_PER_DEG_LON_EQUATOR = 111_320


class InvalidBoundary(ValueError):
    pass


def outer_ring(polygon: dict) -> list[tuple[float, float]]:
    """The exterior ring as (lon, lat) pairs, without the closing point. Holes are ignored for area."""
    if polygon.get("type") != "Polygon" or not polygon.get("coordinates"):
        raise InvalidBoundary("Boundary must be a GeoJSON Polygon.")
    ring = [(float(p[0]), float(p[1])) for p in polygon["coordinates"][0]]
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        raise InvalidBoundary("Boundary needs at least three distinct points.")
    for lon, lat in ring:
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise InvalidBoundary("Coordinates must be [longitude, latitude] in degrees.")
    return ring


def close_ring(polygon: dict) -> dict:
    """Same polygon with every ring closed, as GeoJSON requires."""
    rings = [[list(map(float, p)) for p in r] for r in polygon["coordinates"]]
    for r in rings:
        if r[0] != r[-1]:
            r.append(list(r[0]))
    return {"type": "Polygon", "coordinates": rings}


def _xy(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    lat_c = sum(lat for _, lat in ring) / len(ring)
    kx = M_PER_DEG_LON_EQUATOR * math.cos(math.radians(lat_c))
    return [(lon * kx, lat * M_PER_DEG_LAT) for lon, lat in ring]


def area_ha(polygon: dict) -> float:
    xy = _xy(outer_ring(polygon))
    a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(xy, xy[1:] + xy[:1]))
    if a == 0:
        raise InvalidBoundary("Boundary has zero area.")
    return abs(a) / 2 / 10_000


def centroid(polygon: dict) -> tuple[float, float]:
    """(lat, lon) of the vertex mean. Good enough for weather/soil lookups on a field-sized polygon."""
    ring = outer_ring(polygon)
    return sum(lat for _, lat in ring) / len(ring), sum(lon for lon, _ in ring) / len(ring)
