"""Fields on a farm may touch along a fence line but never share area."""
import pytest

from app.modules.croptwin import geometry
from app.modules.croptwin.models import Field
from app.modules.croptwin.seed import seed_demo_farm
from tests.ownership import claim


def square(x0, y0, x1, y1):
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


A = square(0, 0, 2, 2)


@pytest.mark.parametrize("b, expected", [
    (square(1, 1, 3, 3), True),            # corners cross
    (square(0.5, 0.5, 1.5, 1.5), True),    # fully inside
    (square(-1, -1, 3, 3), True),          # fully contains
    (square(0, 0, 2, 2), True),            # identical
    (square(1, 0, 3, 2), True),            # overlaps along collinear edges, no crossing
    ({"type": "Polygon", "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 0]]]}, True),  # triangle on A's corners
    (square(2, 0, 4, 2), False),           # shares an edge (fence line)
    (square(2, 2, 4, 4), False),           # shares a corner
    (square(2, 0.5, 4, 1.5), False),       # touches part of an edge
    (square(5, 5, 6, 6), False),           # apart
])
def test_overlaps(b, expected):
    assert geometry.overlaps(A, b) is expected
    assert geometry.overlaps(b, A) is expected


# The seeded North Field spans 42.03673-42.04167 N, 93.46250-93.45384 W.
INTO_NORTH = square(-93.4600, 42.0390, -93.4560, 42.0430)
EAST_OF_NORTH = square(-93.45384, 42.0380, -93.45330, 42.0400)  # on North Field's east edge, west of Creek Field
SOUTH = square(-93.4620, 42.0300, -93.4580, 42.0330)


def test_create_overlapping_field_is_409(client, db_session):
    seed_demo_farm(db_session)
    claim(db_session)
    r = client.post("/api/farms/demo/fields", json={"name": "Bad", "boundary": INTO_NORTH})
    assert r.status_code == 409
    assert r.json()["detail"] == "This boundary overlaps North Field. Adjust it so fields don't share area."
    assert client.post("/api/farms/demo/fields", json={"name": "Neighbour", "boundary": EAST_OF_NORTH}).status_code == 201


def test_other_farms_are_not_checked(client, db_session):
    seed_demo_farm(db_session)
    claim(db_session)
    farm_id = client.post("/api/farms", json={"name": "Elsewhere"}).json()["id"]
    assert client.post(f"/api/farms/{farm_id}/fields", json={"name": "Same spot", "boundary": INTO_NORTH}).status_code == 201


def test_boundary_update_into_another_field_is_409_and_changes_nothing(client, db_session):
    seed_demo_farm(db_session)
    claim(db_session)
    field = client.post("/api/farms/demo/fields", json={"name": "South", "boundary": SOUTH}).json()
    base = f"/api/farms/demo/fields/{field['id']}"
    r = client.patch(base, json={"boundary": INTO_NORTH, "name": "Moved"})
    assert r.status_code == 409 and "North Field" in r.json()["detail"]
    after = client.get(base).json()
    assert after["boundary"] == field["boundary"] and after["name"] == "South"


def test_existing_overlap_still_allows_other_edits(client, db_session):
    """Fields saved before the check existed may overlap; editing their name or crop must still work."""
    seed_demo_farm(db_session)
    claim(db_session)
    north = client.get("/api/farms/demo/fields/north").json()
    db_session.add(Field(id="legacy", farm_id="demo", name="Legacy", boundary=north["boundary"], centroid_lat=42.04,
                         centroid_lon=-93.46, area_ha=1.0, area_source="farmer"))
    db_session.commit()
    r = client.patch("/api/farms/demo/fields/legacy", json={"name": "Legacy renamed", "current_crop_id": "oats"})
    assert r.status_code == 200 and r.json()["name"] == "Legacy renamed"
    r = client.patch("/api/farms/demo/fields/north", json={"irrigation_available": True})
    assert r.status_code == 200
