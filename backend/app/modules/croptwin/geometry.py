"""Field geometry from a GeoJSON polygon: validation, centroid, area, and the overlap rule between fields.

The frontend copies `_self_intersects` and `overlaps` in frontend/src/shared/map/BoundaryDraw.tsx so the UI warns
before saving; keep both copies in step.

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
    if _self_intersects(ring):
        raise InvalidBoundary("Boundary edges cross each other. Redraw it so the outline doesn't loop over itself.")
    return ring


def _self_intersects(ring: list[tuple[float, float]]) -> bool:
    """True if two non-adjacent edges cross. A crossing outline makes the shoelace area meaningless."""
    def orient(a, b, c) -> float:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    edges = list(zip(ring, ring[1:] + ring[:1]))
    n = len(edges)
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue  # first and last edges share the closing vertex
            (p1, p2), (q1, q2) = edges[i], edges[j]
            d1, d2 = orient(q1, q2, p1), orient(q1, q2, p2)
            d3, d4 = orient(p1, p2, q1), orient(p1, p2, q2)
            if d1 * d2 < 0 and d3 * d4 < 0:
                return True
    return False


def close_ring(polygon: dict) -> dict:
    """Same polygon with every ring closed, as GeoJSON requires."""
    rings = [[list(map(float, p)) for p in r] for r in polygon["coordinates"]]
    for r in rings:
        if r[0] != r[-1]:
            r.append(list(r[0]))
    return {"type": "Polygon", "coordinates": rings}


def overlaps(a: dict, b: dict) -> bool:
    """True if two polygons share area. Outlines that only touch along an edge or at a corner don't overlap,
    because neighbouring fields often share a fence line.

    Shares area when: two edges properly cross, a corner of one lies strictly inside the other, the midpoint
    of an edge lies strictly inside the other (catches overlaps along collinear edges), or the outlines are
    identical. Exact arithmetic on the given coordinates; no tolerance.
    """
    ra, rb = outer_ring(a), outer_ring(b)
    if _same_ring(ra, rb):
        return True
    ea, eb = _edges(ra), _edges(rb)
    if any(_properly_cross(p, q) for p in ea for q in eb):
        return True
    probes_a = ra + [_mid(e) for e in ea]
    probes_b = rb + [_mid(e) for e in eb]
    return any(_strictly_inside(p, rb) for p in probes_a) or any(_strictly_inside(p, ra) for p in probes_b)


def _edges(ring):
    return list(zip(ring, ring[1:] + ring[:1]))


def _mid(edge):
    (x0, y0), (x1, y1) = edge
    return (x0 + x1) / 2, (y0 + y1) / 2


def _orient(a, b, c) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _properly_cross(e, f) -> bool:
    (p1, p2), (q1, q2) = e, f
    return _orient(q1, q2, p1) * _orient(q1, q2, p2) < 0 and _orient(p1, p2, q1) * _orient(p1, p2, q2) < 0


def _on_segment(p, a, b) -> bool:
    return (_orient(a, b, p) == 0 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= p[1] <= max(a[1], b[1]))


def _strictly_inside(p, ring) -> bool:
    """Ray casting; points on the outline count as outside."""
    if any(_on_segment(p, a, b) for a, b in _edges(ring)):
        return False
    inside = False
    for (x0, y0), (x1, y1) in _edges(ring):
        if (y0 > p[1]) != (y1 > p[1]) and p[0] < x0 + (p[1] - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside


def _same_ring(a, b) -> bool:
    return sorted(a) == sorted(b)


def _xy(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    lat_c = sum(lat for _, lat in ring) / len(ring)
    kx = M_PER_DEG_LON_EQUATOR * math.cos(math.radians(lat_c))
    return [(lon * kx, lat * M_PER_DEG_LAT) for lon, lat in ring]


def area_ha(polygon: dict) -> float:
    """Area in hectares of the outer ring (shoelace on the local projection). Raises InvalidBoundary for zero area."""
    xy = _xy(outer_ring(polygon))
    a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(xy, xy[1:] + xy[:1]))
    if a == 0:
        raise InvalidBoundary("Boundary has zero area.")
    return abs(a) / 2 / 10_000


def centroid(polygon: dict) -> tuple[float, float]:
    """(lat, lon) of the vertex mean. Good enough for weather/soil lookups on a field-sized polygon."""
    ring = outer_ring(polygon)
    return sum(lat for _, lat in ring) / len(ring), sum(lon for lon, _ in ring) / len(ring)
