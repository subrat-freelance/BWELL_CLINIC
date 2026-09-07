"""Runnable self-check: python test_app.py (no pytest needed)."""
import io
import os
import pathlib
from datetime import date, datetime, timedelta, timezone

from openpyxl import load_workbook

DB_FILE = pathlib.Path(__file__).with_name("test_bwell.db")
DB_FILE.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{DB_FILE.as_posix()}"

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import (  # noqa: E402
    Staff, app, backfill_identifiers, engine, ensure_columns, new_login_code, pwd,
    rate_limit,
)
from sqlalchemy import inspect as sa_inspect, text as sa_text  # noqa: E402
from sqlmodel import Session  # noqa: E402


def seed_staff():
    """Two real accounts: one owner, one front desk."""
    with Session(engine) as db:
        db.add(Staff(username="owner", full_name="OWNER ONE", role="OWNER",
                     password_hash=pwd.hash("owner-pass-123")))
        db.add(Staff(username="desk", full_name="DESK TWO", role="STAFF",
                     password_hash=pwd.hash("desk-pass-123")))
        db.commit()


DESK_HEADERS: dict = {}


def staff_token(c, username, password):
    r = c.post("/api/v1/auth/staff-login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def enrol(c, name, phone, headers=None, **extra):
    """Registration is a counter activity — it needs a signed-in member of staff."""
    return c.post(
        "/api/v1/auth/register",
        headers=headers if headers is not None else DESK_HEADERS,
        json={"full_name": name, "phone_number": phone, "age": 34, "gender": "FEMALE", **extra},
    )


def token(c, phone, password):
    r = c.post("/api/v1/auth/patient-login", json={"phone_number": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()


def run() -> None:
    code = new_login_code()
    assert len(code) == 8 and set(code) <= set("ABCDEFGHJKMNPQRSTVWXYZ23456789")
    assert new_login_code() != new_login_code()   # random, not derived from anything

    # rate_limit lets max_hits through, then trips (its own bucket, so endpoints are untouched)
    req = type("R", (), {"client": type("C", (), {"host": "1.2.3.4"})()})()
    for _ in range(3):
        rate_limit(req, "selftest", 3, 60)
    try:
        rate_limit(req, "selftest", 3, 60)
        raise AssertionError("rate_limit did not trip")
    except HTTPException as e:
        assert e.status_code == 429

    with TestClient(app) as c:
        # ------------------------------------------------------- staff sign-in
        seed_staff()
        assert c.post("/api/v1/auth/staff-login",
                      json={"username": "owner", "password": "wrong"}).status_code == 401
        assert c.post("/api/v1/auth/staff-login",
                      json={"username": "ghost", "password": "owner-pass-123"}).status_code == 401
        ADMIN = staff_token(c, "owner", "owner-pass-123")
        DESK = staff_token(c, "desk", "desk-pass-123")
        DESK_HEADERS.update(DESK)

        # the register is not open to the internet
        assert c.post("/api/v1/auth/register", json={
            "full_name": "WALK IN", "phone_number": "9000000000",
            "age": 30, "gender": "FEMALE"}).status_code == 401
        assert c.get("/api/v1/staff/me", headers=ADMIN).json()["role"] == "OWNER"
        assert "password_hash" not in c.get("/api/v1/staff/me", headers=ADMIN).json()

        # ---------------------------------------------------------- registration
        r = enrol(c, "jyotirrekha mantri", "934-882-0192",
                  diagnosis="OA Knee (Lt) / Cartilage Issue", category="c")
        assert r.status_code == 201, r.text
        reg = r.json()
        assert reg["patient"]["full_name"] == "JYOTIRREKHA MANTRI"   # uppercase enforced
        assert reg["patient"]["phone_number"] == "9348820192"        # digits only
        wife_pw = reg["password"]                                    # random, printed once
        assert len(wife_pw) == 8
        assert len(reg["sessions"]) == 10 and reg["completed_sessions"] == 0

        # ------------------------------------------- one number, several patients
        r = enrol(c, "RAJESH MANTRI", "9348820192", gender="MALE", category="A")
        assert r.status_code == 201, r.text                          # husband, same phone
        husband_pw = r.json()["password"]
        assert r.json()["shared_number_count"] == 2

        r = enrol(c, "R JYOTI SAHOO", "9348820192")                  # a third, different person
        assert r.status_code == 201, r.text
        sahoo_pw = r.json()["password"]

        r = enrol(c, "JYOTIRREKHA MANTRI", "9348820192")             # the same person again
        assert r.status_code == 409 and "New case" in r.json()["detail"]

        # the printed code, not the phone, picks the person (and it is case-insensitive)
        wife_auth, wife = token(c, "9348820192", wife_pw.lower())
        husband_auth, husband = token(c, "9348820192", husband_pw)
        assert wife["patient"]["full_name"] == "JYOTIRREKHA MANTRI"
        assert husband["patient"]["full_name"] == "RAJESH MANTRI"
        assert wife["patient"]["id"] != husband["patient"]["id"]
        bad = next(x for x in ("XXXXXXXX", "YYYYYYYY", "ZZZZZZZZ", "QQQQQQQQ")
                   if x not in {wife_pw, husband_pw, sahoo_pw})
        assert c.post("/api/v1/auth/patient-login",
                      json={"phone_number": "9348820192", "password": bad}).status_code == 401

        # staff cannot see a code, but can reissue one a patient has lost
        husband_id = husband["patient"]["id"]
        fresh = c.post(f"/api/v1/admin/patients/{husband_id}/reset-login", headers=DESK).json()
        assert len(fresh["password"]) == 8 and fresh["password"] != husband_pw
        assert fresh["login_id"] == "9348820192"
        assert c.post("/api/v1/auth/patient-login",
                      json={"phone_number": "9348820192", "password": husband_pw}).status_code == 401
        token(c, "9348820192", fresh["password"])   # the reissued code works

        assert c.get("/api/v1/patient/me").status_code == 401        # token required
        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert me["patient"]["id"] == wife["patient"]["id"]
        assert me["shared_number_count"] == 3 and "shared_number_with" not in me   # count only

        # ------------------------------------------------------------------ admin
        assert c.get("/api/v1/admin/patients").status_code == 401    # admin key required
        admin = c.get("/api/v1/admin/patients", headers=ADMIN).json()
        assert admin["stats"] == {
            "total": 3, "by_category": {"A": 2, "C": 1}, "shared_numbers": 1}
        assert all(p["shares_number"] for p in admin["patients"])
        assert all(p["total_sessions"] == 10 for p in admin["patients"])

        # searching the shared number returns everyone on it
        found = c.get("/api/v1/admin/patients?q=9348820192", headers=ADMIN).json()["patients"]
        assert {p["full_name"] for p in found} == {
            "JYOTIRREKHA MANTRI", "RAJESH MANTRI", "R JYOTI SAHOO"}
        assert c.get("/api/v1/admin/patients?q=rajesh", headers=ADMIN).json()["patients"]
        assert c.get("/api/v1/admin/patients?q=nobody", headers=ADMIN).json()["patients"] == []

        wife_id = wife["patient"]["id"]
        detail = c.get(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN).json()
        assert {p["full_name"] for p in detail["shared_number_with"]} == {
            "RAJESH MANTRI", "R JYOTI SAHOO"}

        # ------------------------------------------------------- verify a package
        for session in wife["sessions"]:
            r = c.put(f"/api/v1/admin/attendance/{session['id']}", headers=ADMIN,
                      json={"is_verified": True, "protocol_note": "IFT + ROM"})
            assert r.status_code == 200, r.text
            assert r.json()["session_date"] is not None                # auto-stamped

        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert me["completed_sessions"] == 10 and me["is_package_completed"] is True
        assert c.put("/api/v1/admin/attendance/nope", headers=ADMIN,
                     json={"is_verified": True}).status_code == 404

        # ------------------------------------------- same patient, second episode
        r = c.post(f"/api/v1/admin/patients/{wife_id}/packages", headers=ADMIN,
                   json={"package_name": "20-Day Intensive Package", "validity_days": 20,
                         "total_sessions": 20, "payment_mode": "UPI",
                         "diagnosis": "post-op acl reconstruction", "category": "A"})
        assert r.status_code == 201, r.text
        case2 = r.json()
        assert len(case2["packages"]) == 2
        assert sum(p["is_active"] for p in case2["packages"]) == 1     # only one runs at a time
        assert case2["package"]["package_name"] == "20-Day Intensive Package"
        assert len(case2["sessions"]) == 20 and case2["completed_sessions"] == 0
        assert case2["patient"]["diagnosis"] == "POST-OP ACL RECONSTRUCTION"
        assert case2["patient"]["category"] == "A"

        # the portal follows the live package; progress restarts, history is kept
        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert me["completed_sessions"] == 0 and me["is_package_completed"] is False
        assert len(me["packages"]) == 2

        # the old package is still readable by id, with its 10 verified sessions
        old = next(p for p in case2["packages"] if not p["is_active"])
        prior = c.get(f"/api/v1/admin/patients/{wife_id}?package_id={old['id']}", headers=ADMIN).json()
        assert prior["completed_sessions"] == 10 and prior["is_package_completed"] is True

        # the queue counts the running package only, so she is back to 0/20
        row = next(p for p in c.get("/api/v1/admin/patients?q=9348", headers=ADMIN).json()["patients"]
                   if p["id"] == wife_id)
        assert row["completed_sessions"] == 0 and row["total_sessions"] == 20

        assert c.post("/api/v1/admin/patients/nope/packages", headers=ADMIN, json={}).status_code == 404

        # ---------------------------------- portal sees its own history + household
        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert [p["completed_sessions"] for p in me["packages"]] == [0, 10]   # newest first
        assert {h["full_name"] for h in me["household"]} == {"RAJESH MANTRI", "R JYOTI SAHOO"}
        assert all("diagnosis" not in h for h in me["household"])   # no clinical leak to the portal
        assert all("diagnosis" in h for h in detail["shared_number_with"])   # admin does get it
        assert next(h for h in me["household"] if h["full_name"] == "RAJESH MANTRI")["cases"] == 1

        # a patient may reopen an earlier case of their own, but not someone else's
        old_view = c.get(f"/api/v1/patient/me?package_id={old['id']}", headers=wife_auth).json()
        assert old_view["completed_sessions"] == 10
        husband_pkg = c.get("/api/v1/patient/me", headers=husband_auth).json()["package"]["id"]
        assert c.get(f"/api/v1/patient/me?package_id={husband_pkg}",
                     headers=wife_auth).status_code == 404

        # -------------------------------------------- therapist name on the session
        first = case2["sessions"][0]
        r = c.put(f"/api/v1/admin/attendance/{first['id']}", headers=ADMIN,
                  json={"is_verified": True, "protocol_note": "SWD 15min",
                        "attended_by": "DR. A. PATNAIK"})
        assert r.status_code == 200 and r.json()["attended_by"] == "DR. A. PATNAIK"
        assert c.get("/api/v1/patient/me", headers=wife_auth).json()["sessions"][0][
            "attended_by"] == "DR. A. PATNAIK"

        # ------------------------------------- custom, pay-per-visit style package
        r = c.post(f"/api/v1/admin/patients/{wife_id}/packages", headers=ADMIN,
                   json={"package_name": "Daily Visit - Pay Per Session", "validity_days": 3,
                         "total_sessions": 3, "payment_mode": "UPI", "price": 1350,
                         "start_date": "2026-09-01", "end_date": "2026-09-03"})
        assert r.status_code == 201, r.text
        custom = r.json()["package"]
        assert custom["price"] == 1350 and custom["total_sessions"] == 3
        assert custom["start_date"] == "2026-09-01" and custom["end_date"] == "2026-09-03"
        assert len(r.json()["sessions"]) == 3

        # dates default from validity_days when the admin leaves them blank
        plain = c.post(f"/api/v1/admin/patients/{husband['patient']['id']}/packages", headers=ADMIN,
                       json={"validity_days": 10}).json()["package"]
        assert plain["end_date"] == str(date.fromisoformat(plain["start_date"]) + timedelta(days=9))

        # guards: backwards dates, and a session count nobody meant to type
        assert c.post(f"/api/v1/admin/patients/{wife_id}/packages", headers=ADMIN,
                      json={"start_date": "2026-09-10", "end_date": "2026-09-01"}).status_code == 422
        assert c.post(f"/api/v1/admin/patients/{wife_id}/packages", headers=ADMIN,
                      json={"total_sessions": 5000}).status_code == 422

        # admin can correct price and dates afterwards
        r = c.put(f"/api/v1/admin/packages/{custom['id']}", headers=ADMIN,
                  json={"price": 1500, "end_date": "2026-09-05"})
        assert r.status_code == 200 and r.json()["price"] == 1500
        assert c.put(f"/api/v1/admin/packages/{custom['id']}", headers=ADMIN,
                     json={"end_date": "2026-08-01"}).status_code == 422   # before start_date
        assert c.put("/api/v1/admin/packages/nope", headers=ADMIN, json={"price": 1}).status_code == 404

        # ------------------------------------------------- receipts against a package
        custom_id = custom["id"]                       # the pay-per-visit case, now ₹1,500
        assert c.post(f"/api/v1/admin/packages/{custom_id}/payments",
                      json={"amount": 500}).status_code == 401      # admin key required
        assert c.post(f"/api/v1/admin/packages/{custom_id}/payments", headers=ADMIN,
                      json={"amount": 0}).status_code == 422        # zero is meaningless
        assert c.post("/api/v1/admin/packages/nope/payments", headers=ADMIN,
                      json={"amount": 500}).status_code == 404

        r = c.post(f"/api/v1/admin/packages/{custom_id}/payments", headers=ADMIN,
                   json={"amount": 500, "mode": "UPI", "paid_on": "2026-09-01",
                         "reference": "UPI/2026/0001"})
        assert r.status_code == 201, r.text
        assert r.json()["amount"] == 500 and r.json()["paid_on"] == "2026-09-01"
        assert r.json()["patient_id"] == wife_id                    # derived from the package

        # a part-payment leaves a balance the portal can see
        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert me["paid"] == 500 and me["balance"] == 1000 and len(me["payments"]) == 1

        c.post(f"/api/v1/admin/packages/{custom_id}/payments", headers=ADMIN,
               json={"amount": 1000, "mode": "CASH", "paid_on": "2026-09-04"})
        assert c.get("/api/v1/patient/me", headers=wife_auth).json()["balance"] == 0   # settled

        # a refund is a negative receipt, not a deleted one — the trail survives
        c.post(f"/api/v1/admin/packages/{custom_id}/payments", headers=ADMIN,
               json={"amount": -200, "mode": "UPI", "paid_on": "2026-09-05", "note": "part refund"})
        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert me["paid"] == 1300 and me["balance"] == 200 and len(me["payments"]) == 3

        # receipts hang off the package, so an earlier case keeps its own money
        assert c.get(f"/api/v1/patient/me?package_id={old['id']}",
                     headers=wife_auth).json()["payments"] == []
        row = next(p for p in c.get("/api/v1/admin/patients?q=9348", headers=ADMIN).json()["patients"]
                   if p["id"] == wife_id)
        assert row["balance"] == 200                                # surfaced on the queue

        # a mistyped receipt can be removed outright
        strike = c.post(f"/api/v1/admin/packages/{custom_id}/payments", headers=ADMIN,
                        json={"amount": 9999}).json()
        assert c.get("/api/v1/patient/me", headers=wife_auth).json()["paid"] == 1300 + 9999
        assert c.delete(f"/api/v1/admin/payments/{strike['id']}", headers=ADMIN).status_code == 204
        assert c.delete(f"/api/v1/admin/payments/{strike['id']}", headers=ADMIN).status_code == 404
        assert c.get("/api/v1/patient/me", headers=wife_auth).json()["paid"] == 1300

        # ------------------------------------------------ catalogue the admin owns
        assert c.get("/api/v1/catalogue").json() == []          # read is open, starts empty
        assert c.post("/api/v1/admin/catalogue", json={"name": "X"}).status_code == 401
        assert c.post("/api/v1/admin/catalogue", headers=ADMIN,
                      json={"kind": "NONSENSE", "name": "X"}).status_code == 422
        assert c.post("/api/v1/admin/catalogue", headers=ADMIN,
                      json={"kind": "ADDON", "name": "  "}).status_code == 422

        plan = c.post("/api/v1/admin/catalogue", headers=ADMIN,
                      json={"kind": "package", "name": "10-Day Rehab Package", "price": 6000,
                            "total_sessions": 10, "validity_days": 10, "sort_order": 1}).json()
        assert plan["kind"] == "PACKAGE"                        # normalised
        daily = c.post("/api/v1/admin/catalogue", headers=ADMIN,
                       json={"kind": "PER_VISIT", "name": "Daily Visit", "price": 450,
                             "sort_order": 2}).json()
        needling = c.post("/api/v1/admin/catalogue", headers=ADMIN,
                          json={"kind": "ADDON", "name": "Dry Needling", "price": 500}).json()
        c.post("/api/v1/admin/catalogue", headers=ADMIN,
               json={"kind": "THERAPIST", "name": "DR. S. K. MISHRA"})

        # the price changes from the Settings screen, not a deploy
        assert c.put(f"/api/v1/admin/catalogue/{plan['id']}", headers=ADMIN,
                     json={"price": 6500}).json()["price"] == 6500
        assert c.put("/api/v1/admin/catalogue/nope", headers=ADMIN,
                     json={"price": 1}).status_code == 404

        # Diagnosis categories are catalogue rows too, so the clinic adds its own
        cat = c.post("/api/v1/admin/catalogue", headers=ADMIN,
                     json={"kind": "CATEGORY", "name": " sports  injury ",
                           "code": "s1", "sort_order": 4})
        assert cat.status_code == 201, cat.text
        assert cat.json()["name"] == "sports injury" and cat.json()["code"] == "S1"
        assert c.post("/api/v1/admin/catalogue", headers=ADMIN,
                      json={"kind": "CATEGORY", "name": "Bad", "code": "!!"}).status_code == 422
        assert c.post("/api/v1/admin/catalogue", headers=ADMIN,
                      json={"kind": "NONSENSE", "name": "Bad"}).status_code == 422
        # renaming a category never touches the code patients are filed under
        assert c.put(f"/api/v1/admin/catalogue/{cat.json()['id']}", headers=ADMIN,
                     json={"name": "Sports & Athletic Injury"}).json()["code"] == "S1"
        # ...and a patient can then be filed under it
        assert c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN,
                     json={"category": "S1"}).json()["patient"]["category"] == "S1"
        c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN, json={"category": "C"})

        assert {i["kind"] for i in c.get("/api/v1/catalogue").json()} == {
            "PACKAGE", "PER_VISIT", "ADDON", "THERAPIST", "CATEGORY"}
        assert [i["name"] for i in c.get("/api/v1/catalogue?kind=addon").json()] == ["Dry Needling"]

        # retiring an item hides it from the pickers without touching booked cases
        c.put(f"/api/v1/admin/catalogue/{daily['id']}", headers=ADMIN, json={"is_active": False})
        assert daily["id"] not in {i["id"] for i in c.get("/api/v1/catalogue").json()}
        assert daily["id"] in {i["id"] for i in c.get("/api/v1/catalogue?include_inactive=true").json()}
        c.put(f"/api/v1/admin/catalogue/{daily['id']}", headers=ADMIN, json={"is_active": True})

        # ------------------------------------------------ add-ons and discounts
        assert c.post(f"/api/v1/admin/packages/{custom_id}/charges", headers=ADMIN,
                      json={"description": " ", "amount": 100}).status_code == 422
        assert c.post("/api/v1/admin/packages/nope/charges", headers=ADMIN,
                      json={"description": "x", "amount": 1}).status_code == 404

        addon = c.post(f"/api/v1/admin/packages/{custom_id}/charges", headers=ADMIN,
                       json={"description": needling["name"], "amount": 500, "quantity": 2}).json()
        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert me["billed"] == 1500 + 1000                     # package + 2 x add-on
        assert me["balance"] == me["billed"] - me["paid"] == 1200

        discount = c.post(f"/api/v1/admin/packages/{custom_id}/charges", headers=ADMIN,
                          json={"description": "Goodwill discount", "amount": -300}).json()
        me = c.get("/api/v1/patient/me", headers=wife_auth).json()
        assert me["billed"] == 2200 and len(me["charges"]) == 2
        row = next(p for p in c.get("/api/v1/admin/patients?q=9348", headers=ADMIN).json()["patients"]
                   if p["id"] == wife_id)
        assert row["balance"] == 900                            # add-ons reach the queue

        assert c.delete(f"/api/v1/admin/charges/{addon['id']}", headers=ADMIN).status_code == 204
        assert c.get("/api/v1/patient/me", headers=wife_auth).json()["billed"] == 1200
        assert c.delete(f"/api/v1/admin/charges/{addon['id']}", headers=ADMIN).status_code == 404
        c.post(f"/api/v1/admin/packages/{custom_id}/charges", headers=ADMIN,
               json={"description": needling["name"], "amount": 500, "quantity": 2})

        # --------------------------------------------- daily basis, billed per visit
        walkin = enrol(c, "MEENA DAS", "9812345670", per_visit_rate=450, total_sessions=1,
                       validity_days=30, package_name="Daily Visit", advance_amount=450)
        assert walkin.status_code == 201, walkin.text
        walkin = walkin.json()
        walkin_pkg, walkin_id = walkin["package"]["id"], walkin["patient"]["id"]
        assert walkin["package"]["per_visit_rate"] == 450 and walkin["package"]["price"] == 0
        assert walkin["billed"] == 0 and walkin["paid"] == 450   # nothing attended yet, paid ahead
        assert walkin["balance"] == -450                         # a credit, not a debt

        c.put(f"/api/v1/admin/attendance/{walkin['sessions'][0]['id']}", headers=ADMIN,
              json={"is_verified": True})
        detail = c.get(f"/api/v1/admin/patients/{walkin_id}", headers=ADMIN).json()
        assert detail["billed"] == 450 and detail["balance"] == 0   # one visit, settled

        # the card grows a visit at a time
        r = c.post(f"/api/v1/admin/packages/{walkin_pkg}/sessions?count=2", headers=ADMIN)
        assert r.status_code == 201, r.text
        assert len(r.json()["sessions"]) == 3 and r.json()["package"]["total_sessions"] == 3
        assert [s["session_day"] for s in r.json()["sessions"]] == [1, 2, 3]
        for s in r.json()["sessions"][1:]:
            c.put(f"/api/v1/admin/attendance/{s['id']}", headers=ADMIN, json={"is_verified": True})
        detail = c.get(f"/api/v1/admin/patients/{walkin_id}", headers=ADMIN).json()
        assert detail["billed"] == 1350 and detail["balance"] == 900   # 3 visits x 450
        assert c.post(f"/api/v1/admin/packages/{walkin_pkg}/sessions?count=200",
                      headers=ADMIN).status_code == 422
        assert c.post("/api/v1/admin/packages/nope/sessions", headers=ADMIN).status_code == 404

        # ------------------------------------------------ admin edits the patient
        assert c.put(f"/api/v1/admin/patients/{wife_id}", json={"age": 40}).status_code == 401
        r = c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN,
                  json={"full_name": "jyotirrekha  mantri", "age": 35, "category": "b",
                        "address": "plot 100, saheed nagar", "diagnosis": "oa knee (lt)"})
        assert r.status_code == 200, r.text
        edited = r.json()["patient"]
        assert edited["full_name"] == "JYOTIRREKHA MANTRI"       # uppercased and squeezed
        assert edited["age"] == 35 and edited["category"] == "B"
        assert edited["address"] == "PLOT 100, SAHEED NAGAR"
        assert edited["phone_number"] == "9348820192"            # login untouched
        # the login still works — the code is stored hashed, never re-derived from the name
        token(c, "9348820192", wife_pw)
        # Categories are the clinic's to define now, so a code it has not used before
        # is accepted; only a malformed one is refused.
        assert c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN,
                     json={"category": "D1"}).status_code == 200
        assert c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN,
                     json={"category": "!!"}).status_code == 422
        assert c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN,
                     json={"category": ""}).status_code == 422   # blank is not a code
        assert c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN,
                     json={"full_name": "123"}).status_code == 422
        assert c.put("/api/v1/admin/patients/nope", headers=ADMIN, json={"age": 1}).status_code == 404
        c.put(f"/api/v1/admin/patients/{wife_id}", headers=ADMIN, json={"category": "A"})

        # ------------------------------------------------------ the today board
        assert c.get("/api/v1/admin/today").status_code == 401
        board = c.get("/api/v1/admin/today", headers=ADMIN).json()
        assert board["date"] == str(today := date.today())
        assert {r["full_name"] for r in board["scheduled_today"]} >= {"MEENA DAS"}
        assert all(r["balance"] > 0 for r in board["outstanding"])
        assert {r["full_name"] for r in board["outstanding"]} >= {"MEENA DAS"}
        assert board["collected_today"] >= 450                   # the walk-in's advance
        assert all(r["end_date"] >= str(today) for r in board["expiring_soon"])

        # ------------------------------------------------- who may do what
        # no token at all
        assert c.get("/api/v1/admin/patients").status_code == 401
        assert c.get("/api/v1/staff/me").status_code == 401

        # the two audiences do not cross: a patient token is not a staff token
        assert c.get("/api/v1/admin/patients", headers=wife_auth).status_code == 403
        assert c.get("/api/v1/patient/me", headers=ADMIN).status_code == 403

        # front desk runs the day to day...
        assert c.get("/api/v1/admin/patients", headers=DESK).status_code == 200
        assert c.get("/api/v1/admin/today", headers=DESK).status_code == 200
        assert c.put(f"/api/v1/admin/patients/{wife_id}", headers=DESK,
                     json={"age": 36}).status_code == 200
        # ...but does not set the prices, or touch staff
        assert c.post("/api/v1/admin/catalogue", headers=DESK,
                      json={"kind": "ADDON", "name": "Sneaky", "price": 1}).status_code == 403
        assert c.put(f"/api/v1/admin/catalogue/{plan['id']}", headers=DESK,
                     json={"price": 1}).status_code == 403
        assert c.get("/api/v1/admin/staff", headers=DESK).status_code == 403

        # ------------------------------------------------------ staff accounts
        assert len(c.get("/api/v1/admin/staff", headers=ADMIN).json()) == 2
        assert c.post("/api/v1/admin/staff", headers=ADMIN,
                      json={"username": "owner", "full_name": "X", "password": "another-pass"}
                      ).status_code == 409                              # username taken
        assert c.post("/api/v1/admin/staff", headers=ADMIN,
                      json={"username": "shorty", "full_name": "X", "password": "abc"}
                      ).status_code == 422                              # password too short
        assert c.post("/api/v1/admin/staff", headers=ADMIN,
                      json={"username": "bad name!", "full_name": "X", "password": "long-enough"}
                      ).status_code == 422
        assert c.post("/api/v1/admin/staff", headers=ADMIN,
                      json={"username": "temp", "full_name": "X", "password": "long-enough",
                            "role": "WIZARD"}).status_code == 422

        assert c.post("/api/v1/admin/staff", headers=ADMIN,
                      json={"username": "temp2", "full_name": "X", "password": "long-enough",
                            "phone": "12345"}).status_code == 422   # phone must be 10 digits

        r = c.post("/api/v1/admin/staff", headers=ADMIN,
                   json={"username": "  Locum.One ", "full_name": "  locum   one ",
                         "password": "locum-pass-123", "role": "staff",
                         "phone": "98-765-00000"})
        assert r.status_code == 201, r.text
        locum = r.json()
        assert locum["username"] == "locum.one" and locum["full_name"] == "LOCUM ONE"
        assert locum["role"] == "STAFF" and "password_hash" not in locum
        assert locum["phone"] == "9876500000"   # normalised to 10 digits
        locum_auth = staff_token(c, "locum.one", "locum-pass-123")

        # a staff member cannot change their own password until an owner allows it
        assert c.post("/api/v1/staff/change-password", headers=locum_auth,
                      json={"current_password": "locum-pass-123",
                            "new_password": "self-set-123"}).status_code == 403
        assert c.put(f"/api/v1/admin/staff/{locum['id']}", headers=ADMIN,
                     json={"can_change_password": True}).status_code == 200
        # wrong current password is refused even with permission
        assert c.post("/api/v1/staff/change-password", headers=locum_auth,
                      json={"current_password": "WRONGPW",
                            "new_password": "self-set-123"}).status_code == 401
        assert c.post("/api/v1/staff/change-password", headers=locum_auth,
                      json={"current_password": "locum-pass-123",
                            "new_password": "self-set-123"}).status_code == 200
        staff_token(c, "locum.one", "self-set-123")   # the new one works

        # an owner resets a password; the old one stops working
        assert c.put(f"/api/v1/admin/staff/{locum['id']}", headers=ADMIN,
                     json={"password": "fresh-pass-123"}).status_code == 200
        assert c.post("/api/v1/auth/staff-login",
                      json={"username": "locum.one", "password": "locum-pass-123"}
                      ).status_code == 401
        staff_token(c, "locum.one", "fresh-pass-123")

        # deactivating locks them out, and their live token dies with the account
        assert c.put(f"/api/v1/admin/staff/{locum['id']}", headers=ADMIN,
                     json={"is_active": False}).status_code == 200
        assert c.get("/api/v1/admin/patients", headers=locum_auth).status_code == 401
        assert c.post("/api/v1/auth/staff-login",
                      json={"username": "locum.one", "password": "fresh-pass-123"}
                      ).status_code == 401

        # the clinic can never be left without an owner, and you cannot lock yourself out
        owner_id = c.get("/api/v1/staff/me", headers=ADMIN).json()["id"]
        assert c.put(f"/api/v1/admin/staff/{owner_id}", headers=ADMIN,
                     json={"role": "STAFF"}).status_code == 422
        assert c.put(f"/api/v1/admin/staff/{owner_id}", headers=ADMIN,
                     json={"is_active": False}).status_code == 422
        assert c.delete(f"/api/v1/admin/staff/{owner_id}", headers=ADMIN).status_code == 422
        # promote someone, and the guard lifts
        desk_id = c.get("/api/v1/staff/me", headers=DESK).json()["id"]
        assert c.put(f"/api/v1/admin/staff/{desk_id}", headers=ADMIN,
                     json={"role": "OWNER"}).status_code == 200
        assert c.put(f"/api/v1/admin/staff/{owner_id}", headers=ADMIN,
                     json={"role": "OWNER"}).status_code == 200      # still fine
        assert c.delete(f"/api/v1/admin/staff/{locum['id']}", headers=ADMIN).status_code == 204
        assert c.delete(f"/api/v1/admin/staff/{locum['id']}", headers=ADMIN).status_code == 404
        c.put(f"/api/v1/admin/staff/{desk_id}", headers=ADMIN, json={"role": "STAFF"})

        # receipts carry the name of whoever took the money
        assert all(r["recorded_by"] == "OWNER ONE"
                   for r in c.get("/api/v1/patient/me", headers=wife_auth).json()["payments"])

        # ----------------------------------------------------------- xlsx export
        assert c.get("/api/v1/admin/export.xlsx").status_code == 401
        r = c.get("/api/v1/admin/export.xlsx", headers=ADMIN)
        assert r.status_code == 200
        assert r.content.startswith(b"PK")                       # a real zipped workbook
        assert ".xlsx" in r.headers["content-disposition"]
        assert "spreadsheetml" in r.headers["content-type"]

        book = load_workbook(io.BytesIO(r.content))
        assert book.sheetnames == ["Summary", "Patients", "Sessions", "Payments"]
        assert book.active.title == "Summary"           # opens on the summary
        sheet = book["Patients"]
        assert sheet.freeze_panes == "A2" and sheet.auto_filter.ref == sheet.dimensions
        assert sheet.cell(row=1, column=1).font.bold

        head = [cell.value for cell in sheet[1]]
        rows = [dict(zip(head, [cell.value for cell in row])) for row in sheet.iter_rows(min_row=2)]
        assert len(rows) == 4
        jyoti = next(x for x in rows if x["Patient Name"] == "JYOTIRREKHA MANTRI")
        assert jyoti["Phone (Login ID)"] == "9348820192"
        assert jyoti["Package"] == "Daily Visit - Pay Per Session"
        assert jyoti["Status"] == "ONGOING"

        # typed cells, not strings — so Excel can sort and total them
        assert jyoti["Billed (INR)"] == 2200 and isinstance(jyoti["Billed (INR)"], int)
        assert jyoti["Paid (INR)"] == 1300 and jyoti["Balance (INR)"] == 900
        assert jyoti["Total Sessions"] == 3 and isinstance(jyoti["Total Sessions"], int)
        assert jyoti["Start Date"].date() == date(2026, 9, 1)
        assert jyoti["End Date"].date() == date(2026, 9, 5)
        price_cell = sheet.cell(row=rows.index(jyoti) + 2, column=head.index("Billed (INR)") + 1)
        assert "#,##0" in price_cell.number_format

        # the daily-basis patient bills per visit, so her rate shows and the fee is blank
        meena = next(x for x in rows if x["Patient Name"] == "MEENA DAS")
        assert meena["Per Visit Rate"] == 450 and meena["Billed (INR)"] == 1350
        assert meena["Balance (INR)"] == 900

        # ------------------------------------------------------- sessions sheet
        day_book = book["Sessions"]
        assert day_book.freeze_panes == "A2" and day_book.auto_filter.ref == day_book.dimensions
        shead = [cell.value for cell in day_book[1]]
        srows = [
            dict(zip(shead, [cell.value for cell in row])) for row in day_book.iter_rows(min_row=2)
        ]

        # every booked session of every package, not just the running one
        per_patient = {}
        for row in srows:
            per_patient[row["Patient Name"]] = per_patient.get(row["Patient Name"], 0) + 1
        assert per_patient == {
            "JYOTIRREKHA MANTRI": 10 + 20 + 3,   # rehab + intensive + pay-per-visit
            "RAJESH MANTRI": 10 + 10,
            "R JYOTI SAHOO": 10,
            "MEENA DAS": 3,                      # daily basis, grown one visit at a time
        }
        names = [row["Patient Name"] for row in srows]
        assert names == sorted(names)            # grouped per patient, then package, then day
        assert any(row["Status"] == "PENDING" for row in srows)

        # each case's rows stay in one uncut block — two patients sharing a name, or one
        # patient's two same-named packages, must not interleave — with days running 1..n
        blocks, days = [], []
        for row in srows:
            key = (row["Patient Name"], row["Phone"], row["Case"])
            if not blocks or blocks[-1] != key:
                blocks.append(key)
                days.append([])
            days[-1].append(row["Day"])
        assert len(blocks) == len(set(blocks)), "a case's sessions were split apart"
        assert all(d == list(range(1, len(d) + 1)) for d in days), "days out of order"
        # the wife's three cases are numbered oldest-first
        assert [row["Case"] for row in srows if row["Patient Name"] == "JYOTIRREKHA MANTRI"] == (
            [1] * 10 + [2] * 20 + [3] * 3
        )

        tagged = [row for row in srows if row["Attended By"] == "DR. A. PATNAIK"]
        assert len(tagged) == 1
        assert tagged[0]["Package"] == "20-Day Intensive Package"
        assert tagged[0]["Day"] == 1 and tagged[0]["Protocol Note"] == "SWD 15min"
        assert tagged[0]["Status"] == "COMPLETED"
        assert tagged[0]["Session Date"].date() == date.today()   # auto-stamped on verify

        # the export honours the same search filter on both sheets
        filtered = load_workbook(io.BytesIO(
            c.get("/api/v1/admin/export.xlsx?q=rajesh", headers=ADMIN).content))
        assert filtered["Patients"].max_row == 2                  # header + one patient
        name_col = shead.index("Patient Name") + 1
        assert {
            row[0] for row in filtered["Sessions"].iter_rows(
                min_row=2, min_col=name_col, max_col=name_col, values_only=True)
        } == {"RAJESH MANTRI"}
        assert filtered["Sessions"].max_row == 21                 # header + his 20 sessions

        # ------------------------------------------------------- summary sheet
        summary = book["Summary"]

        def trim(row):
            cells = list(row)
            while cells and cells[-1] is None:
                cells.pop()
            return tuple(cells)

        grid = [trim(row) for row in summary.iter_rows(values_only=True)]
        kv = {row[0]: row[1] for row in grid if len(row) > 1 and row[0]}

        # the headline numbers must agree with the sheets they summarise
        assert kv["Total patients"] == sheet.max_row - 1 == 4
        assert kv["Sessions booked"] == day_book.max_row - 1 == 66
        assert kv["Completed"] == sum(1 for row in srows if row["Status"] == "COMPLETED") == 14
        assert kv["Pending"] == 52 and kv["Completed"] + kv["Pending"] == kv["Sessions booked"]
        assert abs(kv["Completion rate"] - 14 / 66) < 1e-9
        assert kv["Category A"] == 4 and kv["Shared phone numbers"] == 1
        assert kv["Total cases (packages)"] == 7
        assert kv["Running"] == 4 and kv["Closed"] == 3
        assert kv["Running"] + kv["Closed"] == kv["Total cases (packages)"]

        # only the custom package carries a price, so it is the whole billed figure
        assert kv["Billed (agreed package value)"] == 2200 + 1350  # her case + 3 walk-in visits
        assert kv["Collected (receipts)"] == 1300 + 450    # hers, plus the walk-in advance
        assert kv["Outstanding"] == 1800
        assert kv["Billed (agreed package value)"] - kv["Collected (receipts)"] == kv["Outstanding"]
        assert abs(kv["Collection rate"] - 1750 / 3550) < 1e-9
        assert kv["Average billed per case"] == round(
            kv["Billed (agreed package value)"] / kv["Total cases (packages)"])

        # receipts break down by how the money actually arrived, refund included
        assert ("UPI", 2, 300) in grid and ("CASH", 2, 1450) in grid
        assert ("Daily Visit - Pay Per Session", 1, 3, 2200, 1300) in grid
        assert ("Daily Visit", 1, 3, 1350, 450) in grid          # billed per visit attended
        assert ("10-Day Rehab Package", 4, 40, 0, 0) in grid
        modes = [row for row in grid if len(row) == 3 and isinstance(row[1], int)]
        assert sum(row[2] for row in modes) == kv["Collected (receipts)"]

        payments = book["Payments"]
        phead = [c.value for c in payments[1]]
        prows = [dict(zip(phead, [c.value for c in r])) for r in payments.iter_rows(min_row=2)]
        assert len(prows) == 4
        assert sum(r["Amount (INR)"] for r in prows) == kv["Collected (receipts)"]
        dates = [r["Receipt Date"].date() for r in prows]
        assert dates == sorted(dates)                                # oldest first
        hers = [r for r in prows if r["Patient Name"] == "JYOTIRREKHA MANTRI"]
        assert [r["Amount (INR)"] for r in hers] == [500, 1000, -200]
        assert hers[0]["Reference"] == "UPI/2026/0001"
        # counter receipts name the person; a public sign-up names the channel
        assert {r["Taken By"] for r in prows} == {"OWNER ONE", "Registration"}
        assert all(r["Taken By"] == "OWNER ONE" for r in hers)
        assert hers[2]["Note"] == "part refund"

        revenue_row = next(
            n for n, row in enumerate(grid, start=1)
            if row and row[0] == "Billed (agreed package value)"
        )
        assert "#,##0" in summary.cell(row=revenue_row, column=2).number_format
        rate_row = next(n for n, row in enumerate(grid, start=1) if row and row[0] == "Completion rate")
        assert "%" in summary.cell(row=rate_row, column=2).number_format
        assert "negative receipt" in grid[-1][0]   # the refund caveat

        # ------------------------------------------- date window on the Sessions sheet
        today = date.today()
        attended = [row for row in srows if row["Session Date"]]
        assert len(attended) == 14        # her 11, plus the walk-in's 3 visits

        def window(**params):
            query = "&".join(f"{k}={v}" for k, v in params.items())
            r = c.get(f"/api/v1/admin/export.xlsx?{query}", headers=ADMIN)
            assert r.status_code == 200, r.text
            book = load_workbook(io.BytesIO(r.content))
            return book, book["Sessions"].max_row - 1

        # a window keeps only sessions actually attended inside it — pending rows drop out
        _, n = window(**{"from": today, "to": today})
        assert n == 14
        _, n = window(**{"from": today + timedelta(days=1)})
        assert n == 0
        _, n = window(**{"to": today - timedelta(days=1)})
        assert n == 0
        # open-ended on either side still works
        _, n = window(**{"from": today})
        assert n == 14

        # the window is a search, so the register narrows to the people it found — the
        # file has to match the console list it was exported from
        book2, _ = window(**{"from": today, "to": today})
        seen_rows = [
            dict(zip([c.value for c in book2["Patients"][1]], [c.value for c in row]))
            for row in book2["Patients"].iter_rows(min_row=2)
        ]
        seen_names = {r["Patient Name"] for r in seen_rows}
        assert seen_names == {"JYOTIRREKHA MANTRI", "MEENA DAS"}, seen_names
        # and the Sessions sheet can only be about people the Patients sheet lists
        assert {
            r["Patient Name"]
            for r in (
                dict(zip([c.value for c in book2["Sessions"][1]], [c.value for c in row]))
                for row in book2["Sessions"].iter_rows(min_row=2)
            )
        } <= seen_names
        # a window nobody attended in returns nobody, rather than the whole register
        empty, n = window(**{"from": today + timedelta(days=1)})
        assert n == 0 and empty["Patients"].max_row == 1           # header only
        assert book2.sheetnames == ["Summary", "Patients", "Sessions", "Payments"]

        # the summary reports the window alongside the unwindowed totals
        windowed = {
            row[0]: row[1]
            for row in book2["Summary"].iter_rows(values_only=True)
            if row[0] and row[1] is not None
        }
        assert windowed[f"In window ({today} to {today})"] == 14

        # Same time bomb as below: a bare 450 here only held while none of the fixture's
        # hard-coded September payment dates happened to be today. Assert the intent —
        # the window lists exactly the receipts dated in it, and the summary agrees.
        today_rows = [
            dict(zip(phead, [cell.value for cell in row]))
            for row in book2["Payments"].iter_rows(min_row=2)
        ]
        assert today_rows and all(str(r["Receipt Date"])[:10] == str(today) for r in today_rows)
        assert windowed[f"Collected in window ({today} to {today})"] == sum(
            r["Amount (INR)"] for r in today_rows
        )
        assert "In window" not in " ".join(str(k) for k in kv)       # absent without a window

        # a window covering the receipts picks them up, sessions or not
        sept, _ = window(**{"from": "2026-09-01", "to": "2026-09-30"})
        sept_kv = {
            row[0]: row[1]
            for row in sept["Summary"].iter_rows(values_only=True)
            if row[0] and row[1] is not None
        }
        sept_rows = [
            dict(zip(phead, [cell.value for cell in row]))
            for row in sept["Payments"].iter_rows(min_row=2)
        ]
        hers = [r for r in sept_rows if r["Patient Name"] == "JYOTIRREKHA MANTRI"]
        assert len(hers) == 3 and sum(r["Amount (INR)"] for r in hers) == 1300
        # The summary line has to agree with the sheet it summarises. Asserting a bare
        # 1300 here was a time bomb: it only held while today fell outside September.
        assert sept_kv["Collected in window (2026-09-01 to 2026-09-30)"] == sum(
            r["Amount (INR)"] for r in sept_rows
        )

        # the filename carries the window so monthly exports sort themselves
        r = c.get(f"/api/v1/admin/export.xlsx?from={today}&to={today}", headers=ADMIN)
        assert f"bwell-patients-{today}_to_{today}.xlsx" in r.headers["content-disposition"]

        assert c.get(f"/api/v1/admin/export.xlsx?from={today}&to={today - timedelta(days=1)}",
                     headers=ADMIN).status_code == 422             # backwards window
        assert c.get("/api/v1/admin/export.xlsx?from=not-a-date", headers=ADMIN).status_code == 422


        # ------------------------------------------------------ clinic letterhead
        blank = c.get("/api/v1/clinic").json()      # open: a patient prints it too
        assert blank["uhid_prefix"] == "BW" and blank["uhid_seq"] >= 4
        assert c.put("/api/v1/admin/clinic", headers=DESK,
                     json={"name": "X"}).status_code == 403          # owner only
        saved = c.put("/api/v1/admin/clinic", headers=ADMIN, json={
            "name": "B-Well Physiotherapy & Rehab",
            "address": "Plot 12, Saheed Nagar, Bhubaneswar 751007",
            "registration_no": "OD/CE/2019/4471",
            "physio_name": "DR. A. PATNAIK",
        }).json()
        assert saved["name"] == "B-Well Physiotherapy & Rehab"
        assert saved["footer_note"], "untouched fields keep their wording"
        assert c.get("/api/v1/clinic").json()["registration_no"] == "OD/CE/2019/4471"
        assert c.put("/api/v1/admin/clinic", headers=ADMIN, json={"name": "  "}).status_code == 422
        assert c.put("/api/v1/admin/clinic", headers=ADMIN,
                     json={"receipt_prefix": "far too long"}).status_code == 422

        # ---------------------------------------------------------------- UHID
        everyone = c.get("/api/v1/admin/patients", headers=ADMIN).json()["patients"]
        codes = [p["uhid"] for p in everyone]
        assert all(u and u.startswith("BW-") for u in codes)
        assert len(set(codes)) == len(codes)                         # never reissued
        card = everyone[0]
        hit = c.get(f"/api/v1/admin/patients?q={card['uhid']}", headers=ADMIN).json()["patients"]
        assert [p["id"] for p in hit] == [card["id"]], "the number on the card must find them"

        # ------------------------------------------------------ receipt numbers
        issued = c.get("/api/v1/clinic").json()["receipt_seq"]
        first = c.post(f"/api/v1/admin/packages/{custom_id}/payments", headers=ADMIN,
                       json={"amount": 100, "mode": "CASH"}).json()
        assert first["receipt_no"] == f"RCT-{issued + 1:05d}"
        c.delete(f"/api/v1/admin/payments/{first['id']}", headers=ADMIN)
        second = c.post(f"/api/v1/admin/packages/{custom_id}/payments", headers=ADMIN,
                        json={"amount": 100, "mode": "CASH"}).json()
        assert second["receipt_no"] == f"RCT-{issued + 2:05d}", "a number went out twice"
        c.delete(f"/api/v1/admin/payments/{second['id']}", headers=ADMIN)
        # a clinic moving off a paper book starts where the book stopped, never before
        assert c.put("/api/v1/admin/clinic", headers=ADMIN,
                     json={"receipt_seq": 1}).status_code == 422

        # ------------------------------------------------------------- billing
        assert c.get("/api/v1/admin/billing", headers=DESK).status_code == 403
        assert c.get("/api/v1/admin/billing", headers=ADMIN,
                     params={"from": "2026-09-30", "to": "2026-09-01"}).status_code == 422
        money = c.get("/api/v1/admin/billing", headers=ADMIN).json()
        assert money["totals"]["collected"] == money["totals"]["collected_lifetime"] == 1750
        assert money["totals"]["billed_lifetime"] == 3550
        assert money["totals"]["outstanding"] == 1800

        # every breakdown has to add back up to the headline it sits under
        assert sum(m["amount"] for m in money["by_mode"]) == money["totals"]["collected"]
        assert sum(d["amount"] for d in money["by_day"]) == money["totals"]["collected"]
        assert {m["mode"] for m in money["by_mode"]} == {"CASH", "UPI"}
        assert len(money["ledger"]) == money["totals"]["receipts"] == 4
        assert all(row["receipt_no"] and row["uhid"] for row in money["ledger"])
        assert sum(r["balance"] for r in money["outstanding"]) == money["totals"]["outstanding"]
        assert sum(b["amount"] for b in money["ageing"]) == money["totals"]["outstanding"]
        assert sum(b["cases"] for b in money["ageing"]) == len(money["outstanding"])
        ages = [r["days"] for r in money["outstanding"]]
        assert ages == sorted(ages, reverse=True), "oldest debt first"
        # a running case nobody priced is surfaced, not silently treated as free
        assert money["unbilled"], "unpriced cases should be flagged"
        owed = {r["package_id"] for r in money["outstanding"]}
        assert all(row["package_id"] not in owed for row in money["unbilled"])

        # a window narrows the takings but never the dues — March's debt is owed in June
        sept = c.get("/api/v1/admin/billing", headers=ADMIN,
                     params={"from": "2026-09-01", "to": "2026-09-05"}).json()
        assert sept["totals"]["collected"] == sum(r["amount"] for r in sept["ledger"])
        assert all("2026-09-01" <= r["paid_on"] <= "2026-09-05" for r in sept["ledger"])
        assert sept["totals"]["outstanding"] == money["totals"]["outstanding"]
        quiet = c.get("/api/v1/admin/billing", headers=ADMIN,
                      params={"from": "2020-01-01", "to": "2020-01-31"}).json()
        assert quiet["totals"]["collected"] == 0 and quiet["ledger"] == []
        assert quiet["totals"]["outstanding"] == money["totals"]["outstanding"]

        # ------------------------------------------------ upgrade an old database
        # A clinic with a year of data cannot be told to reseed, so a new column has
        # to land on the live file. Drop one and prove startup puts it back.
        with engine.begin() as conn:
            conn.execute(sa_text("DROP INDEX ix_patient_uhid"))   # SQLite blocks the drop otherwise
            conn.execute(sa_text("ALTER TABLE patient DROP COLUMN uhid"))
        assert "uhid" not in {col["name"] for col in sa_inspect(engine).get_columns("patient")}
        ensure_columns()
        assert {ix["name"] for ix in sa_inspect(engine).get_indexes("patient")} >= {
            "ix_patient_uhid"
        }, "the index has to come back with the column"
        backfill_identifiers()
        restored = c.get("/api/v1/admin/patients", headers=ADMIN).json()["patients"]
        assert all(p["uhid"] for p in restored)
        assert len({p["uhid"] for p in restored}) == len(restored)
        ensure_columns()                                   # idempotent, runs every boot


        # ------------------------------------------- searching history by date
        everyone_now = c.get("/api/v1/admin/patients", headers=ADMIN).json()
        assert c.get("/api/v1/admin/patients", headers=ADMIN,
                     params={"from": today, "to": today - timedelta(days=1)}).status_code == 422

        seen_today = c.get("/api/v1/admin/patients", headers=ADMIN,
                           params={"from": today, "to": today}).json()
        assert {p["full_name"] for p in seen_today["patients"]} == {
            "JYOTIRREKHA MANTRI", "MEENA DAS"
        }
        # the KPI row is the whole clinic, not the search — it must not move with the window
        assert seen_today["stats"] == everyone_now["stats"]
        # visits are counted inside the window; the last visit stays lifetime
        by_name = {p["full_name"]: p for p in seen_today["patients"]}
        assert by_name["JYOTIRREKHA MANTRI"]["visits"] == 11
        assert by_name["MEENA DAS"]["visits"] == 3
        assert all(p["last_visit"] == str(today) for p in seen_today["patients"])

        # a window nobody attended in finds nobody, rather than falling back to everyone
        assert c.get("/api/v1/admin/patients", headers=ADMIN,
                     params={"from": today + timedelta(days=1)}).json()["patients"] == []
        assert c.get("/api/v1/admin/patients", headers=ADMIN,
                     params={"to": today - timedelta(days=1)}).json()["patients"] == []

        # the text search still applies on top of the window
        narrowed = c.get("/api/v1/admin/patients", headers=ADMIN,
                         params={"from": today, "to": today, "q": "meena"}).json()["patients"]
        assert [p["full_name"] for p in narrowed] == ["MEENA DAS"]
        # ...and a term that matches someone who did not attend that day finds nobody
        assert c.get("/api/v1/admin/patients", headers=ADMIN,
                     params={"from": today, "to": today, "q": "rajesh"}).json()["patients"] == []

        # ------------------------------------------------ inquiries from the site
        # Anyone may raise one — that is the point of a public enquiry form.
        r = c.post("/api/v1/inquiries", json={
            "full_name": "  sasmita  behera ", "phone_number": "98-111-22-333",
            "reason": "Joint pain", "preferred_slot": "4:30 pm (evening)",
            "symptoms": "  right   knee, three weeks  "})
        assert r.status_code == 201, r.text
        assert r.json()["received"] is True
        # It acknowledges, and hands back nothing about the clinic or the row.
        assert set(r.json()) == {"received", "reference"}

        assert c.post("/api/v1/inquiries",
                      json={"full_name": "X", "phone_number": "12345"}).status_code == 422
        assert c.post("/api/v1/inquiries",
                      json={"full_name": "!!", "phone_number": "9811122333"}).status_code == 422

        # ...but only staff may read them
        assert c.get("/api/v1/admin/inquiries").status_code == 401
        board = c.get("/api/v1/admin/inquiries", headers=DESK).json()
        assert board["counts"]["NEW"] == 1
        raised = board["inquiries"][0]
        assert raised["full_name"] == "SASMITA BEHERA"        # normalised like a patient
        assert raised["phone_number"] == "9811122333"          # digits only
        assert raised["symptoms"] == "right knee, three weeks"  # whitespace collapsed
        assert raised["status"] == "NEW" and raised["handled_by"] is None

        # A double-tap on a slow connection refreshes the row instead of duplicating it
        c.post("/api/v1/inquiries", json={"full_name": "SASMITA BEHERA",
                                          "phone_number": "9811122333", "reason": "Spine"})
        again = c.get("/api/v1/admin/inquiries", headers=DESK).json()
        assert again["counts"]["NEW"] == 1
        assert again["inquiries"][0]["reason"] == "Spine"      # the later details win

        # Working it stamps who did it
        worked = c.patch(f"/api/v1/admin/inquiries/{raised['id']}", headers=DESK,
                         json={"status": "contacted", "note": "  rang back,  booking Tue "})
        assert worked.status_code == 200, worked.text
        assert worked.json()["status"] == "CONTACTED"          # case-insensitive in
        assert worked.json()["note"] == "rang back, booking Tue"
        assert worked.json()["handled_by"] == "DESK TWO" and worked.json()["handled_at"]

        assert c.patch(f"/api/v1/admin/inquiries/{raised['id']}", headers=DESK,
                       json={"status": "MAYBE"}).status_code == 422
        assert c.patch("/api/v1/admin/inquiries/nope", headers=DESK,
                       json={"status": "CLOSED"}).status_code == 404

        # Filtering, and the rule that open ones never age off the board
        assert c.get("/api/v1/admin/inquiries", headers=DESK,
                     params={"status": "NEW"}).json()["inquiries"] == []
        with Session(engine) as db:
            from main import Inquiry
            old = db.get(Inquiry, raised["id"])
            old.created_at = datetime.now(timezone.utc) - timedelta(days=400)
            db.add(old); db.commit()
        still_there = c.get("/api/v1/admin/inquiries", headers=DESK,
                            params={"days": 1}).json()["inquiries"]
        assert [i["id"] for i in still_there] == [raised["id"]]   # CONTACTED is still open
        c.patch(f"/api/v1/admin/inquiries/{raised['id']}", headers=DESK,
                json={"status": "CLOSED"})
        assert c.get("/api/v1/admin/inquiries", headers=DESK,
                     params={"days": 1}).json()["inquiries"] == []   # settled, so it ages off

        # ------------------------------------------ break-glass recovery
        import main as _m
        _m._hits.clear()   # a fresh rate-limit window for these checks
        _m.RECOVERY_KEY = "test-recovery-key-xyz"
        assert c.post("/api/v1/auth/recover",
                      json={"username": "owner", "recovery_key": "WRONG"}).status_code == 401
        rec = c.post("/api/v1/auth/recover",
                     json={"username": "owner", "recovery_key": "test-recovery-key-xyz"})
        assert rec.status_code == 200, rec.text
        assert len(rec.json()["password"]) == 12
        staff_token(c, "owner", rec.json()["password"])   # the recovered login works

        # ------------------------------------------------------ audit log
        assert c.get("/api/v1/admin/audit", headers=DESK).status_code == 403   # owner only
        log = c.get("/api/v1/admin/audit", headers=ADMIN).json()
        actions = {e["action"] for e in log}
        assert {"login", "patient.register", "staff.create", "password.reset",
                "password.change", "inquiry.update", "patient.reset_login",
                "password.recover"} <= actions, actions
        assert all(e["actor_name"] and e["at"] for e in log)

    print("all checks passed")


if __name__ == "__main__":
    run()
    engine.dispose()  # Windows will not unlink a file SQLite still holds open
    DB_FILE.unlink(missing_ok=True)
