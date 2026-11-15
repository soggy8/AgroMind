"""Accounts: sign-up, sign-in, sessions, and who may open which farm (app/access.py)."""
import pytest
from fastapi.testclient import TestClient

from app.modules.accounts.passwords import hash_password, verify_password
from app.modules.croptwin.seed import seed_demo_farm

SQUARE = {"type": "Polygon", "coordinates": [[[-93.50, 42.00], [-93.4975, 42.00], [-93.4975, 42.002], [-93.50, 42.002],
                                              [-93.50, 42.00]]]}


def _other_browser(client: TestClient) -> TestClient:
    """A second browser on the same app and database, with no cookies."""
    return TestClient(client.app)


def test_password_hash_round_trip():
    h = hash_password("correct horse")
    assert h.startswith("scrypt$") and "correct horse" not in h
    assert verify_password("correct horse", h)
    assert not verify_password("wrong horse", h)
    assert not verify_password("x", "not a hash")


def test_signup_signs_in_and_logout_signs_out(anon_client):
    assert anon_client.get("/api/auth/me").json() is None
    r = anon_client.post("/api/auth/signup", json={"email": " Ana@Example.com ", "password": "long enough"})
    assert r.status_code == 201
    assert r.json()["email"] == "ana@example.com"
    cookie = r.headers["set-cookie"]
    assert "agromind_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert anon_client.get("/api/auth/me").json()["email"] == "ana@example.com"
    assert anon_client.post("/api/auth/logout").status_code == 204
    assert anon_client.get("/api/auth/me").json() is None


def test_login_checks_the_password(anon_client):
    anon_client.post("/api/auth/signup", json={"email": "ana@example.com", "password": "long enough"})
    anon_client.post("/api/auth/logout")
    bad = anon_client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong one"})
    assert bad.status_code == 401
    unknown = anon_client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "long enough"})
    assert unknown.status_code == 401 and unknown.json()["detail"] == bad.json()["detail"]  # doesn't say which
    ok = anon_client.post("/api/auth/login", json={"email": "ANA@example.com", "password": "long enough"})
    assert ok.status_code == 200 and anon_client.get("/api/auth/me").json()["email"] == "ana@example.com"


@pytest.mark.parametrize("email,password,status", [
    ("ana@example.com", "short", 422),
    ("not-an-email", "long enough", 422),
    ("farmer@example.com", "long enough", 409),  # taken by the `client` fixture
])
def test_signup_rejects(client, email, password, status):
    r = _other_browser(client).post("/api/auth/signup", json={"email": email, "password": password})
    assert r.status_code == status, r.text
    assert isinstance(r.json()["detail"], str)


def test_a_forged_cookie_is_nobody(anon_client):
    anon_client.cookies.set("agromind_session", "made-up")
    assert anon_client.get("/api/auth/me").json() is None


def test_failed_sign_ins_are_rate_limited_in_production(anon_client, monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "environment", "production")
    anon_client.post("/api/auth/signup", json={"email": "ana@example.com", "password": "long enough"})
    for _ in range(5):  # successful sign-ins don't count
        assert anon_client.post("/api/auth/login", json={"email": "ana@example.com", "password": "long enough"}).status_code == 200
    codes = [anon_client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong one"}).status_code
             for _ in range(21)]
    assert codes[:20] == [401] * 20 and codes[20] == 429
    # Locked out for now, even with the right password.
    assert anon_client.post("/api/auth/login", json={"email": "ana@example.com", "password": "long enough"}).status_code == 429


def test_no_rate_limit_outside_production(anon_client):
    codes = {anon_client.post("/api/auth/login", json={"email": "a@b.co", "password": "whatever1"}).status_code
             for _ in range(25)}
    assert codes == {401}


# ----- the demo farm is public and read-only -----

def test_visitors_see_and_use_the_demo_farm_but_cannot_change_it(anon_client, db_session):
    seed_demo_farm(db_session)
    farms = anon_client.get("/api/farms").json()
    assert [(f["id"], f["public"]) for f in farms] == [("demo", True)]
    assert anon_client.get("/api/farms/demo").json()["public"] is True
    assert anon_client.get("/api/farms/demo/simulations").status_code == 200
    assert anon_client.get("/api/farms/demo/health").status_code == 200
    run = anon_client.post("/api/farms/demo/simulations/run", json={
        "field_id": "north", "rotations": [{"id": "A", "name": "Maize", "crops": ["maize"]}],
        "scenario": {"temp_delta_c": 0, "rain_change_pct": 0, "years": 2}})
    assert run.status_code == 200, run.text  # a what-if changes nothing
    for method, path, body in [
        ("patch", "/api/farms/demo", {"name": "Mine now"}),
        ("delete", "/api/farms/demo", None),
        ("post", "/api/farms/demo/fields", {"name": "New", "boundary": SQUARE}),
        ("patch", "/api/farms/demo/fields/north", {"name": "x"}),
        ("delete", "/api/farms/demo/fields/north", None),
        ("post", "/api/farms/demo/fields/north/soil/prefill", None),
        ("post", "/api/farms/demo/simulations", {"name": "x", "request": {}}),
    ]:
        r = anon_client.request(method.upper(), path, json=body)
        assert r.status_code == 403, (method, path, r.status_code)
        assert "read-only" in r.json()["detail"]
    assert anon_client.get("/api/farms/demo").json()["name"] == "Demo Farm"


def test_signed_in_users_cannot_change_the_demo_farm_either(client, db_session):
    seed_demo_farm(db_session)
    assert client.patch("/api/farms/demo", json={"name": "Mine now"}).status_code == 403
    assert client.delete("/api/farms/demo").status_code == 403


def test_creating_a_farm_needs_an_account(anon_client):
    r = anon_client.post("/api/farms", json={"name": "My farm"})
    assert r.status_code == 401


# ----- own farms are private -----

def test_own_farms_are_private(client, db_session):
    seed_demo_farm(db_session)
    farm = client.post("/api/farms", json={"name": "Ana's farm"}).json()
    assert farm["public"] is False
    assert client.post(f"/api/farms/{farm['id']}/fields", json={"name": "East", "boundary": SQUARE}).status_code == 201
    assert [f["id"] for f in client.get("/api/farms").json()] == ["demo", farm["id"]]

    stranger = _other_browser(client)
    assert [f["id"] for f in stranger.get("/api/farms").json()] == ["demo"]
    assert stranger.get(f"/api/farms/{farm['id']}").status_code == 404
    assert stranger.get(f"/api/farms/{farm['id']}/simulations").status_code == 404
    assert stranger.delete(f"/api/farms/{farm['id']}").status_code == 404

    stranger.post("/api/auth/signup", json={"email": "bo@example.com", "password": "long enough"})
    assert [f["id"] for f in stranger.get("/api/farms").json()] == ["demo"]
    assert stranger.patch(f"/api/farms/{farm['id']}", json={"name": "Taken"}).status_code == 404
    assert client.get(f"/api/farms/{farm['id']}").json()["name"] == "Ana's farm"
