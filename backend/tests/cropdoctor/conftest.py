from app.modules.cropdoctor.indicators.vegetation import Reading


def season(values_2012, base=0.90, spread=0.02, doys=(185, 193, 201, 209, 217)):
    rs = []
    for i, y in enumerate(range(2002, 2012)):
        v = (base - spread) + (2 * spread) * i / 9
        rs += [Reading(y, d, v, "Terra", 10, 10) for d in doys]
    rs += [Reading(2012, d, v, "Terra", 10, 10) for d, v in values_2012.items()]
    return rs


import pytest


@pytest.fixture
def api(client, db_session):
    """API client on a fresh in-memory database holding CropTwin's demo farm."""
    from app.modules.croptwin.seed import seed_demo_farm

    seed_demo_farm(db_session)
    return client
