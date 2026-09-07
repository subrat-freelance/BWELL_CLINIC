"""Seed 60 demo patients (24 A / 20 B / 16 C) so the admin KPIs are populated.

    python seed.py            # add demo patients
    python seed.py --reset    # drop everything first
    python seed.py --accounts-only  # PRODUCTION: owner + plans/categories, NO demo patients
"""
import os
import secrets
import sys
from datetime import date, timedelta

from sqlmodel import Session, SQLModel, select

from main import (
    AttendanceLog,
    CatalogueItem,
    Staff,
    clinic_profile,
    next_receipt_no,
    NewCaseIn,
    Patient,
    Payment,
    RegisterIn,
    engine,
    open_package,
    pwd,
    register,
)

DEMO_PHONE = "9348820192"

# Bootstrap logins. Passwords come from the environment so nothing real is committed;
# leave them unset and one strong password is generated per install and printed once.
STAFF = [
    (os.getenv("SEED_OWNER_USER", "subrat"), "SUBRAT PARIDA", "OWNER",
     os.getenv("SEED_OWNER_PASSWORD")),
    (os.getenv("SEED_DESK_USER", "frontdesk"), "REKHA NAYAK", "STAFF",
     os.getenv("SEED_DESK_PASSWORD")),
]

FIRST = [
    "JYOTIRREKHA", "SUBRAT", "ANANYA", "RAJESH", "PRIYANKA", "MANOJ", "SUSMITA", "DEBASHIS",
    "KAVITA", "ARUN", "SANGEETA", "BIKASH", "NIHARIKA", "PRAMOD", "ITISHREE", "SANJAY",
    "MADHUSMITA", "TAPAN", "RASHMI", "GOPAL",
]
LAST = ["MANTRI", "SAHOO", "PATRA", "MOHANTY", "DAS", "BEHERA", "NAYAK", "PANDA", "ROUT", "SWAIN"]
DOCTORS = ["DR. S. K. MISHRA", "DR. A. PATNAIK", "DR. R. MOHAPATRA", "DR. N. SAHU"]
CASES = {
    "A": ["OA KNEE (LT) / CARTILAGE ISSUE", "FROZEN SHOULDER (RT)", "POST-OP ACL RECONSTRUCTION",
          "LUMBAR SPONDYLOSIS"],
    "B": ["CERVICAL RADICULOPATHY", "POST-STROKE HEMIPLEGIA (LT)", "BELL'S PALSY",
          "PERIPHERAL NEUROPATHY"],
    "C": ["OA KNEE (LT) / CARTILAGE ISSUE", "CHONDROMALACIA PATELLAE",
          "MENISCAL TEAR (RT) - CONSERVATIVE", "CARTILAGE DEGENERATION - HIP"],
}
PROTOCOLS = [
    "Assessment + IFT 15min + gentle ROM",
    "US therapy 8min + isometric quads x3 sets",
    "SWD 15min + terminal knee extension",
    "Manual therapy + patellar mobilisation",
    "Closed-chain strengthening + wall squats",
    "Proprioception board + gait re-education",
    "Progressive resistance 2kg + step-ups",
    "Dynamic strengthening + balance drills",
    "Endurance training + stair climbing",
    "Reassessment + home exercise programme",
]
# C first so the demo login (i == 0) is the cartilage case from the brief.
COUNTS = {"C": 16, "A": 24, "B": 20}

# Starting catalogue. Everything here is editable on the admin Settings screen —
# it is seed data, not configuration baked into the app.
CATALOGUE = [
    ("PACKAGE", "10-Day Rehab Package", 6000, 10, 10, 1),
    ("PACKAGE", "5-Day Trial Package", 3250, 5, 5, 2),
    ("PACKAGE", "20-Day Intensive Package", 11000, 20, 20, 3),
    ("PER_VISIT", "Daily Visit - Pay Per Session", 450, 0, 30, 4),
    ("PER_VISIT", "Home Visit - Per Session", 900, 0, 30, 5),
    ("ADDON", "Dry Needling", 500, 0, 0, 6),
    ("ADDON", "Kinesio Taping", 350, 0, 0, 7),
    ("ADDON", "Shockwave Therapy", 1200, 0, 0, 8),
    ("ADDON", "Cupping Therapy", 400, 0, 0, 9),
    ("ADDON", "Gait Analysis", 800, 0, 0, 10),
    ("ADDON", "Home Exercise Chart", 200, 0, 0, 11),
] + [("THERAPIST", name, 0, 0, 0, n) for n, name in enumerate(DOCTORS, start=20)]

# Diagnosis categories. Seed data like everything else above — the clinic adds,
# renames and retires these on the Settings screen. The code, not the name, is what
# lands on Patient.category, so renaming one never rewrites a patient row.
CATEGORIES = [
    ("A", "Ortho & Post-Op", 1),
    ("B", "Neuro Rehab", 2),
    ("C", "Cartilage & Degenerative", 3),
    # The clinic's signboard reads "Spine, Joint Pain, Paralysis and Paediatric";
    # the first three are covered above, this is the fourth.
    ("D", "Paediatric", 4),
]

# The letterhead every receipt, bill and treatment record is printed on. Demo values —
# the owner corrects them on the Settings screen before the first real patient.
CLINIC = {
    "name": "B-WELL PHYSIOTHERAPY CLINIC",
    "tagline": "Approach for a pain free and actively independent life",
    "address": "Shop No. 8, Plot No. 4, near Amber Showroom, District Centre, Chandrasekharpur, Bhubaneswar, Odisha 751016",
    "phone": "77499 40400 · 86582 71236",
    "email": "",
    # The clinic has not published a clinical establishment registration number or a
    # state council number. They are left blank rather than invented — the letterhead
    # omits a blank line, and an invented number on a medical document is a forgery.
    # The owner fills these in at Admin -> Settings -> Letterhead.
    "registration_no": "",
    # Whoever is actually seeing patients signs the clinical documents. Dr. Sanjay
    # Kumar is on the signboard but not yet taking patients, so the letterhead names
    # Dr. Arun Kumar Maharana. Change it at Admin -> Settings -> Letterhead.
    "physio_name": "DR. ARUN KUMAR MAHARANA (PT)",
    "physio_qualification": "BPT — Utkal University",
    "physio_reg_no": "",
}


def main(reset: bool = False, demo: bool = True) -> None:
    if reset:
        SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as db:
        issued = []
        for username, full_name, role, password in STAFF:
            if db.exec(select(Staff).where(Staff.username == username)).first():
                continue
            # token_urlsafe(12) is 16 chars of 96-bit entropy — not guessable, still typeable.
            password = password or secrets.token_urlsafe(12)
            db.add(Staff(username=username, full_name=full_name, role=role,
                         password_hash=pwd.hash(password)))
            issued.append((role, username, password))
        db.commit()

        profile = clinic_profile(db)
        if not profile.address:          # first run only - never overwrite a real clinic
            for key, value in CLINIC.items():
                setattr(profile, key, value)
            db.add(profile)
        db.commit()

        for kind, name, price, sessions, validity, order in CATALOGUE:
            if not db.exec(
                select(CatalogueItem).where(CatalogueItem.name == name)
            ).first():
                db.add(CatalogueItem(kind=kind, name=name, price=price,
                                     total_sessions=sessions, validity_days=validity,
                                     sort_order=order))

        for code, name, order in CATEGORIES:
            if not db.exec(
                select(CatalogueItem).where(
                    CatalogueItem.kind == "CATEGORY", CatalogueItem.code == code
                )
            ).first():
                db.add(CatalogueItem(kind="CATEGORY", name=name, code=code, sort_order=order))
        db.commit()

        if not demo:
            print(f"Seeded accounts and {len(CATALOGUE)} catalogue items — no demo patients.")
            if issued:
                print()
                print("  Staff logins — shown once, they are stored hashed:")
                for role, username, password in issued:
                    print(f"    {role:<6} {username:<12} {password}")
                print("  Save these now, then change them on the Staff screen.")
            return

        if db.exec(select(Patient)).first():
            print("Patients already exist - run with --reset to rebuild.")
            return

        i = 0
        for category, count in COUNTS.items():
            for n in range(count):
                name = f"{FIRST[i % len(FIRST)]} {LAST[(i * 3) % len(LAST)]}"
                phone = f"9{700000000 + i * 137911:09d}"
                if i == 0:
                    phone = DEMO_PHONE
                if i == 1:
                    # Husband on his wife's number: same phone, own record, own login.
                    name, phone = "RAJESH MANTRI", DEMO_PHONE
                body = RegisterIn(
                    full_name=name,
                    phone_number=phone,
                    age=22 + (i * 7) % 50,
                    gender=["FEMALE", "MALE"][i % 2],
                    alt_phone=f"8{600000000 + i * 91711:09d}",
                    email=f"{name.split()[0].lower()}{i}@example.com",
                    address=f"PLOT {100 + i}, SAHEED NAGAR, BHUBANESWAR, ODISHA",
                    referring_doctor=DOCTORS[i % len(DOCTORS)],
                    diagnosis=CASES[category][n % len(CASES[category])],
                    category=category,
                    payment_mode=["CASH", "UPI", "CARD"][i % 3],
                    price=6000,
                )
                created = register(body, db)
                patient_id, pkg = created["patient"]["id"], created["package"]

                # Mark a plausible slice of sessions as already attended.
                done = {0: 6, 1: 10}.get(i, (i * 3) % 11)

                # Money in: settled if the course finished, half up front if it is running,
                # nothing yet if they have not started. Leaves a realistic mix of balances.
                if done:
                    paid = pkg["price"] if done >= pkg["total_sessions"] else pkg["price"] // 2
                    db.add(Payment(
                        receipt_no=next_receipt_no(db),
                        patient_id=patient_id,
                        package_id=pkg["id"],
                        amount=paid,
                        paid_on=date.today() - timedelta(days=done),
                        mode=body.payment_mode,
                        reference=f"RCPT/{2000 + i}",
                        note="Full settlement" if paid == pkg["price"] else "Advance",
                    ))
                logs = db.exec(
                    select(AttendanceLog)
                    .where(AttendanceLog.patient_id == patient_id)
                    .order_by(AttendanceLog.session_day)
                ).all()
                start = date.today() - timedelta(days=done)
                for log in logs[:done]:
                    log.session_date = start + timedelta(days=log.session_day - 1)
                    log.protocol_note = PROTOCOLS[log.session_day - 1]
                    log.attended_by = DOCTORS[(i + log.session_day) % len(DOCTORS)]
                    log.is_verified = True
                    db.add(log)
                if i == 1:
                    # Finished that package, back for a second episode of care.
                    second = open_package(
                        db,
                        patient_id,
                        NewCaseIn(
                            package_name="20-Day Intensive Package",
                            validity_days=20,
                            total_sessions=20,
                            payment_mode="UPI",
                            price=11000,
                        ),
                    )
                    db.flush()
                    db.add(Payment(
                        receipt_no=next_receipt_no(db),
                        patient_id=patient_id,
                        package_id=second.id,
                        amount=4000,
                        paid_on=date.today(),
                        mode="UPI",
                        reference="UPI/2026/8841",
                        note="Advance on new case",
                    ))
                db.commit()
                i += 1

        print(f"Seeded {i} patients (A=24, B=20, C=16) and {len(CATALOGUE)} catalogue items.")
        print(f"Demo login      -> {DEMO_PHONE} / JYOT9348  (JYOTIRREKHA MANTRI, 6/10 done)")
        print(f"Same number     -> {DEMO_PHONE} / RAJE9348  (RAJESH MANTRI, 2nd case)")
        if issued:
            print()
            print("  Staff logins — shown once, they are stored hashed:")
            for role, username, password in issued:
                print(f"    {role:<6} {username:<12} {password}")
            print("  Save these now, then change them on the Staff screen.")


if __name__ == "__main__":
    main(reset="--reset" in sys.argv, demo="--accounts-only" not in sys.argv)
