"""B-Well Physiotherapy Clinic - API.

One file on purpose: models, schemas, auth and routes each fit on a screen.
Split it the day a second developer starts fighting you over merge conflicts.
"""
import io
import os
import re
import secrets
import time
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Annotated, Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator, model_validator
from pydantic import Field as PField
from sqlalchemy import inspect as sa_inspect, text
from sqlmodel import Field, Session, SQLModel, create_engine, select
from dotenv import load_dotenv

load_dotenv()  # read backend/.env before anything reads os.getenv

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bwell.db")
DEV_SECRET = "dev-secret-change-me"
SECRET_KEY = os.getenv("SECRET_KEY", DEV_SECRET)
# Break-glass account recovery: a high-entropy key the owner keeps offline. Unset = off.
RECOVERY_KEY = os.getenv("RECOVERY_KEY", "")
TOKEN_TTL_HOURS = 12
STAFF_TTL_HOURS = 10  # a shift, not a fortnight

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

# Patient logins are read off a printed slip: uppercase, no 0/O/1/I/L/U so a
# handwritten or faxed code is not misread. NOT derived from name or phone —
# those identify the person and must never also unlock the medical record.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"


def new_login_code(length: int = 8) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


# ponytail: in-process sliding-window limiter. One clinic, one worker — a dict
# is enough. Move to a shared store only if this runs behind more than one process.
_hits: dict[str, list[float]] = {}


def rate_limit(request: Request, bucket: str, max_hits: int, window_s: int) -> None:
    ip = request.client.host if request.client else "?"  # not XFF: a client forges that
    key = f"{bucket}:{ip}"
    now = time.monotonic()
    recent = [t for t in _hits.get(key, []) if now - t < window_s]
    if len(recent) >= max_hits:
        raise HTTPException(429, "Too many attempts. Please wait a minute and try again.")
    recent.append(now)
    _hits[key] = recent


# ---------------------------------------------------------------- models
class Patient(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    # Hospital number: the identifier that goes on every printed document and on the
    # patient's card. A UUID is not something a person can read back over the phone,
    # and a name plus a shared household number does not identify anyone here.
    uhid: Optional[str] = Field(default=None, index=True)
    # Not unique: households share a number. The derived login code
    # (NAME4 + PH4) is what has to stay unique — enforced in register().
    phone_number: str = Field(index=True, max_length=10)
    full_name: str = Field(index=True)
    password_hash: str
    age: int
    gender: str
    alt_phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    referring_doctor: Optional[str] = None
    diagnosis: Optional[str] = None
    requirements: Optional[str] = None
    category: str = "A"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Package(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    patient_id: str = Field(foreign_key="patient.id", index=True)
    package_name: str = "10-Day Rehab Package"
    validity_days: int = 10
    total_sessions: int = 10
    payment_mode: str = "CASH"
    price: int = 0  # whole rupees — no clinic here bills paise
    # Daily-basis patients pay per visit instead of a package fee. When set, the package
    # fee is ignored and the case bills rate x visits attended.
    per_visit_rate: int = 0
    is_active: bool = True
    start_date: date = Field(default_factory=lambda: datetime.now(timezone.utc).date())
    end_date: Optional[date] = None
    # Booking order. start_date can be back- or forward-dated and two packages can share
    # one, so this — not start_date — is what puts a patient's cases in sequence.
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AttendanceLog(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    patient_id: str = Field(foreign_key="patient.id", index=True)
    package_id: str = Field(foreign_key="package.id", index=True)
    session_day: int
    session_date: Optional[date] = None
    protocol_note: Optional[str] = None
    attended_by: Optional[str] = None  # therapist / doctor who took the session
    is_verified: bool = False


class Payment(SQLModel, table=True):
    """Money actually received against a package. Package.price is what was agreed."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    # Serial number on the paper the patient walks out with. Issued from a counter that
    # only climbs, so deleting a mistyped receipt never reissues its number to someone else.
    receipt_no: Optional[str] = Field(default=None, index=True)
    patient_id: str = Field(foreign_key="patient.id", index=True)
    package_id: str = Field(foreign_key="package.id", index=True)
    amount: int  # whole rupees, as Package.price. Negative records a refund.
    paid_on: date = Field(default_factory=lambda: datetime.now(timezone.utc).date(), index=True)
    mode: str = "CASH"
    reference: Optional[str] = None  # UPI txn id, cheque no, receipt no
    note: Optional[str] = None
    # Name as it was at the time — a receipt should not change when someone is renamed.
    recorded_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Staff(SQLModel, table=True):
    """A person who works here. Replaces the shared admin key.

    OWNER may change rates and manage staff; STAFF runs the day to day.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    username: str = Field(unique=True, index=True)
    full_name: str
    password_hash: str
    role: str = "STAFF"  # OWNER | STAFF
    phone: Optional[str] = None  # WhatsApp/contact number, for sending login codes
    can_change_password: bool = False  # owner may let a staff member set their own
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login_at: Optional[datetime] = None


ROLES = ("OWNER", "STAFF")


class AuditLog(SQLModel, table=True):
    """Who did what. Written on the meaningful writes (accounts, passwords, patients,
    money, config, logins) so an owner can answer 'who changed this'. Append-only in
    practice — nothing in the app updates or deletes a row."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    actor_id: Optional[str] = None
    actor_name: str = ""  # denormalised: survives the staff row being renamed or deleted
    action: str = Field(default="", index=True)  # "patient.update", "staff.create", "login"…
    target: str = ""  # UHID / username / receipt no — what was touched
    summary: str = ""  # short human description


class Charge(SQLModel, table=True):
    """An extra billed onto a case: an add-on therapy, or a negative row for a discount.

    Keeps rates out of the code — the front desk adds a line, nobody deploys.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    patient_id: str = Field(foreign_key="patient.id", index=True)
    package_id: str = Field(foreign_key="package.id", index=True)
    description: str
    amount: int  # whole rupees. Negative is a discount.
    quantity: int = 1
    charged_on: date = Field(default_factory=lambda: datetime.now(timezone.utc).date())
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CatalogueItem(SQLModel, table=True):
    """Everything the clinic configures for itself: plans, rates, therapies, staff.

    The whole point of this table is that adding a therapy or changing a price is
    data entry on the Settings screen, never a code change.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    kind: str = Field(index=True)  # PACKAGE | PER_VISIT | ADDON | THERAPIST | CATEGORY
    name: str
    # CATEGORY only: the short code stored on Patient.category and printed on chips,
    # exports and reports. Kept separate from the name so the clinic can rename
    # "Ortho & Post-Op" without rewriting every patient row that points at "A".
    code: str = ""
    price: int = 0  # package fee, per-visit rate, or add-on charge
    total_sessions: int = 0  # PACKAGE only; PER_VISIT grows a visit at a time
    validity_days: int = 0
    is_active: bool = True
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


KINDS = ("PACKAGE", "PER_VISIT", "ADDON", "THERAPIST", "CATEGORY")


class Clinic(SQLModel, table=True):
    """The clinic's own identity. One row, id "clinic".

    This is the letterhead on every printed document — a receipt or a treatment record
    without the establishment's name, address and registration number is not a medical
    document, it is a screenshot. It also holds the counters behind UHIDs and receipt
    numbers, which is why it is a table and not a constant.
    """

    id: str = Field(default="clinic", primary_key=True)
    name: str = "B-WELL PHYSIOTHERAPY CLINIC"
    tagline: str = "Approach for a pain free and actively independent life"
    address: str = ""
    phone: str = ""
    email: str = ""
    registration_no: str = ""  # clinical establishment registration
    gstin: str = ""
    physio_name: str = ""  # whose name and signature close a clinical report
    physio_qualification: str = "BPT, MPT"
    physio_reg_no: str = ""  # state physiotherapy council registration
    # Healthcare by a clinical establishment is GST-exempt in India, so what the clinic
    # issues is a bill of supply, not a tax invoice. The wording is the clinic's
    # accountant's to own, which is why it is editable rather than printed from code.
    footer_note: str = (
        "Healthcare services provided by a clinical establishment are exempt from GST. "
        "This is a bill of supply, not a tax invoice."
    )
    uhid_prefix: str = "BW"
    receipt_prefix: str = "RCT"
    # High-water marks, never reset and never decremented.
    uhid_seq: int = 0
    receipt_seq: int = 0


class Inquiry(SQLModel, table=True):
    """Someone on the public site asking to be seen.

    Not a patient and not an appointment — a person who put their hand up and now has
    to be rung back. It is a table rather than a WhatsApp message because a request
    that arrives at 9pm has to still be on the front desk's screen in the morning,
    and because "who did we never call back" is a question the clinic should be able
    to answer.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    full_name: str
    phone_number: str = Field(index=True)
    reason: Optional[str] = None  # a speciality, or a general assessment
    preferred_physio: Optional[str] = None
    preferred_date: Optional[date] = Field(default=None, index=True)
    preferred_slot: Optional[str] = None
    symptoms: Optional[str] = None
    status: str = Field(default="NEW", index=True)
    note: Optional[str] = None  # what the desk did about it
    handled_by: Optional[str] = None  # name at the time, as with Payment.recorded_by
    handled_at: Optional[datetime] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )


# NEW is untouched, CONTACTED is rung but not booked, BOOKED became a real visit,
# CLOSED is a wrong number, a duplicate, or someone who went elsewhere.
INQUIRY_STATUS = ("NEW", "CONTACTED", "BOOKED", "CLOSED")


# ---------------------------------------------------------------- schemas
class PackageSpec(BaseModel):
    """Everything the front desk chooses about an episode of care.

    Defaults describe the standard 10-day subscription; an admin overriding
    name/sessions/price/dates is how a pay-per-visit patient gets booked.
    """

    package_name: str = "10-Day Rehab Package"
    validity_days: int = PField(10, ge=1, le=365)
    total_sessions: int = PField(10, ge=1, le=100)
    payment_mode: str = "CASH"
    price: int = PField(0, ge=0)
    per_visit_rate: int = PField(0, ge=0)  # > 0 makes this a daily-basis case
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    advance_amount: int = PField(0, ge=0)  # money taken at the counter right now

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class RegisterIn(PackageSpec):
    full_name: str
    phone_number: str
    age: int = PField(ge=0, le=120)
    gender: str
    alt_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    referring_doctor: Optional[str] = None
    diagnosis: Optional[str] = None
    requirements: Optional[str] = None
    category: str = "A"

    @field_validator("phone_number")
    @classmethod
    def ten_digits(cls, v: str) -> str:
        v = re.sub(r"\D", "", v)
        if len(v) != 10:
            raise ValueError("phone_number must be exactly 10 digits")
        return v

    @field_validator("full_name")
    @classmethod
    def upper(cls, v: str) -> str:
        v = " ".join(v.split()).upper()[:120]  # cap: the public inquiry endpoint feeds this
        if not re.search(r"[A-Z]", v):
            raise ValueError("full_name must contain letters")
        return v

    @field_validator("category")
    @classmethod
    def short_code(cls, v: str) -> str:
        # Membership is not checked here: the categories live in the catalogue and a
        # field validator has no database. The UI only ever offers configured ones,
        # and this endpoint is staff-only, so shape is the guard that earns its keep.
        v = v.strip().upper()[:2]
        if not re.fullmatch(r"[A-Z0-9]{1,2}", v):
            raise ValueError("category must be 1-2 letters or digits")
        return v


class LoginIn(BaseModel):
    phone_number: str
    password: str


class AttendanceIn(BaseModel):
    session_date: Optional[date] = None
    protocol_note: Optional[str] = None
    attended_by: Optional[str] = None
    is_verified: Optional[bool] = None


class NewCaseIn(PackageSpec):
    """A returning patient's next episode of care — same login, fresh package."""

    diagnosis: Optional[str] = None
    category: Optional[str] = None


class PaymentIn(BaseModel):
    amount: int
    paid_on: Optional[date] = None
    mode: str = "CASH"
    reference: Optional[str] = None
    note: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def non_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("amount must not be zero — use a negative amount to record a refund")
        return v


class PackageUpdate(BaseModel):
    """Admin corrections to a running package — name, money, dates."""

    package_name: Optional[str] = None
    payment_mode: Optional[str] = None
    price: Optional[int] = PField(None, ge=0)
    per_visit_rate: Optional[int] = PField(None, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class ChargeIn(BaseModel):
    description: str
    amount: int  # negative records a discount
    quantity: int = PField(1, ge=1, le=100)
    charged_on: Optional[date] = None

    @field_validator("description")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("description is required")
        return v.strip()


class CatalogueIn(BaseModel):
    kind: str = "PACKAGE"
    name: str
    code: str = ""
    price: int = PField(0, ge=0)
    total_sessions: int = PField(0, ge=0, le=100)
    validity_days: int = PField(0, ge=0, le=365)
    is_active: bool = True
    sort_order: int = 0

    @field_validator("kind")
    @classmethod
    def known_kind(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in KINDS:
            raise ValueError(f"kind must be one of {', '.join(KINDS)}")
        return v

    @field_validator("name")
    @classmethod
    def named(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name is required")
        return " ".join(v.split())

    @field_validator("code")
    @classmethod
    def tidy_code(cls, v: str) -> str:
        """CATEGORY rows only. Blank on every other kind, which is why it is not required."""
        v = v.strip().upper()[:2]
        if v and not re.fullmatch(r"[A-Z0-9]{1,2}", v):
            raise ValueError("code must be 1-2 letters or digits")
        return v


class CatalogueUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    price: Optional[int] = PField(None, ge=0)
    total_sessions: Optional[int] = PField(None, ge=0, le=100)
    validity_days: Optional[int] = PField(None, ge=0, le=365)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

    _code = field_validator("code")(CatalogueIn.tidy_code.__func__)


class StaffLoginIn(BaseModel):
    username: str
    password: str


class StaffIn(BaseModel):
    username: str
    full_name: str
    password: str
    role: str = "STAFF"
    phone: Optional[str] = None
    can_change_password: bool = False

    @field_validator("phone")
    @classmethod
    def phone_digits(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        v = re.sub(r"\D", "", v)
        if len(v) != 10:
            raise ValueError("phone must be 10 digits")
        return v

    @field_validator("username")
    @classmethod
    def handle(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.fullmatch(r"[a-z0-9._-]{3,32}", v):
            raise ValueError("username must be 3-32 chars: letters, digits, dot, dash, underscore")
        return v

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v

    @field_validator("full_name")
    @classmethod
    def named(cls, v: str) -> str:
        v = " ".join(v.split()).upper()
        if not re.search(r"[A-Z]", v):
            raise ValueError("full_name is required")
        return v

    @field_validator("role")
    @classmethod
    def known_role(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in ROLES:
            raise ValueError(f"role must be one of {', '.join(ROLES)}")
        return v


class StaffUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
    can_change_password: Optional[bool] = None

    _named = field_validator("full_name")(StaffIn.named.__func__)
    _phone = field_validator("phone")(StaffIn.phone_digits.__func__)
    _strong = field_validator("password")(StaffIn.strong_enough.__func__)
    _role = field_validator("role")(StaffIn.known_role.__func__)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v


class RecoverIn(BaseModel):
    username: str
    recovery_key: str


class PatientUpdate(BaseModel):
    """Everything the front desk may correct after registration.

    The phone number is deliberately absent: it is half the login, and changing it
    would silently orphan the patient's credentials.
    """

    full_name: Optional[str] = None
    age: Optional[int] = PField(None, ge=0, le=120)
    gender: Optional[str] = None
    alt_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    referring_doctor: Optional[str] = None
    diagnosis: Optional[str] = None
    requirements: Optional[str] = None
    category: Optional[str] = None

    @field_validator("full_name", "address", "referring_doctor", "diagnosis")
    @classmethod
    def upper(cls, v: Optional[str]) -> Optional[str]:
        return " ".join(v.split()).upper() if v else v

    @field_validator("category")
    @classmethod
    def short_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().upper()[:2]
        if not re.fullmatch(r"[A-Z0-9]{1,2}", v):
            raise ValueError("category must be 1-2 letters or digits")
        return v


class ClinicUpdate(BaseModel):
    """The letterhead, editable by the owner. The counters are deliberately not here."""

    name: Optional[str] = None
    tagline: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    registration_no: Optional[str] = None
    gstin: Optional[str] = None
    physio_name: Optional[str] = None
    physio_qualification: Optional[str] = None
    physio_reg_no: Optional[str] = None
    footer_note: Optional[str] = None
    uhid_prefix: Optional[str] = None
    receipt_prefix: Optional[str] = None
    # A clinic moving off a paper receipt book starts at 1241, not at 1. Only ever
    # forwards: winding it back would issue a number a patient already holds.
    receipt_seq: Optional[int] = PField(None, ge=0)

    @field_validator("name")
    @classmethod
    def named(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("The clinic name is printed on every document — it cannot be blank")
        return v.strip() if v else v

    @field_validator("uhid_prefix", "receipt_prefix")
    @classmethod
    def short_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{1,6}", v):
            raise ValueError("prefix must be 1-6 letters or digits")
        return v


class InquiryIn(BaseModel):
    """What the public site may send. Everything here crosses a trust boundary:
    this is the one write endpoint with no login in front of it, so every field is
    normalised and length-capped rather than stored as received."""

    full_name: str
    phone_number: str
    reason: Optional[str] = None
    preferred_physio: Optional[str] = None
    preferred_date: Optional[date] = None
    preferred_slot: Optional[str] = None
    symptoms: Optional[str] = None

    _phone = field_validator("phone_number")(RegisterIn.ten_digits.__func__)
    _name = field_validator("full_name")(RegisterIn.upper.__func__)

    @field_validator("reason", "preferred_physio", "preferred_slot", "symptoms")
    @classmethod
    def tidy(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = " ".join(v.split())[:500]
        return v or None


class InquiryUpdate(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = None

    @field_validator("status")
    @classmethod
    def known_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().upper()
        if v not in INQUIRY_STATUS:
            raise ValueError(f"status must be one of {', '.join(INQUIRY_STATUS)}")
        return v

    @field_validator("note")
    @classmethod
    def tidy(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return " ".join(v.split())[:500] or None


# ---------------------------------------------------------------- plumbing
def get_session():
    with Session(engine) as session:
        yield session


DB = Annotated[Session, Depends(get_session)]


def clinic_profile(db: Session) -> Clinic:
    """The single clinic row, created on first use so a fresh database just works."""
    profile = db.get(Clinic, "clinic")
    if profile is None:
        profile = Clinic()
        db.add(profile)
        db.flush()
    return profile


def next_uhid(db: Session) -> str:
    profile = clinic_profile(db)
    profile.uhid_seq += 1
    db.add(profile)
    return f"{profile.uhid_prefix}-{profile.uhid_seq:05d}"


def next_receipt_no(db: Session) -> str:
    profile = clinic_profile(db)
    profile.receipt_seq += 1
    db.add(profile)
    return f"{profile.receipt_prefix}-{profile.receipt_seq:05d}"


def ensure_columns() -> None:
    """create_all adds missing tables but never missing columns.

    A clinic that upgrades with a year of live data in the file cannot be told to
    reseed, so every column added to a model lands here as one ALTER TABLE.
    """
    inspector = sa_inspect(engine)
    for model in SQLModel.__subclasses__():
        table = getattr(model, "__table__", None)
        if table is None or not inspector.has_table(table.name):
            continue
        missing = [
            column
            for column in table.columns
            if column.name not in {c["name"] for c in inspector.get_columns(table.name)}
        ]
        if not missing:
            continue
        with engine.begin() as conn:
            for column in missing:
                conn.execute(
                    text(
                        f"ALTER TABLE {table.name} ADD COLUMN "
                        f"{column.name} {column.type.compile(engine.dialect)}"
                    )
                )
            # ADD COLUMN brings no index with it, so put the model's back.
            for index in table.indexes:
                index.create(bind=conn, checkfirst=True)


def backfill_identifiers() -> None:
    """Number the patients and receipts that predate those columns, oldest first."""
    with Session(engine) as db:
        for patient in db.exec(
            select(Patient).where(Patient.uhid == None).order_by(Patient.created_at)  # noqa: E711
        ).all():
            patient.uhid = next_uhid(db)
            db.add(patient)
        for receipt in db.exec(
            select(Payment)
            .where(Payment.receipt_no == None)  # noqa: E711
            .order_by(Payment.paid_on, Payment.created_at)
        ).all():
            receipt.receipt_no = next_receipt_no(db)
            db.add(receipt)
        db.commit()


def issue_token(subject: str, kind: str, hours: int, **claims) -> str:
    """`kind` keeps the two audiences apart: a patient token is not a staff token."""
    return jwt.encode(
        {
            "sub": subject,
            "typ": kind,
            "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
            **claims,
        },
        SECRET_KEY,
        algorithm="HS256",
    )


def read_token(
    creds: Optional[HTTPAuthorizationCredentials], expected: str
) -> dict:
    if creds is None:
        raise HTTPException(401, "Missing bearer token")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if payload.get("typ") != expected:
        raise HTTPException(403, f"This endpoint needs a {expected} login")
    return payload


def current_patient(
    db: DB, creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]
) -> Patient:
    patient = db.get(Patient, read_token(creds, "patient").get("sub"))
    if not patient:
        raise HTTPException(401, "Unknown patient")
    return patient


def current_staff(
    db: DB, creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]
) -> Staff:
    member = db.get(Staff, read_token(creds, "staff").get("sub"))
    if not member or not member.is_active:
        raise HTTPException(401, "This account is no longer active")
    return member


Me = Annotated[Staff, Depends(current_staff)]


def require_owner(member: Me) -> Staff:
    """Rates and staff are the owner's to change; the front desk runs the day to day."""
    if member.role != "OWNER":
        raise HTTPException(403, "Only an owner can do that")
    return member


Owner = Annotated[Staff, Depends(require_owner)]


def audit(db: Session, actor: Optional[Staff], action: str, target: str = "", summary: str = "") -> None:
    """Record one 'who did what' row. Added to the caller's session; the caller commits."""
    db.add(
        AuditLog(
            actor_id=getattr(actor, "id", None),
            actor_name=getattr(actor, "full_name", "") or "",
            action=action,
            target=target,
            summary=summary,
        )
    )


def last_owner(db: Session, staff_id: str) -> bool:
    """True when removing this person would leave the clinic with no owner."""
    others = db.exec(
        select(Staff).where(
            Staff.role == "OWNER", Staff.is_active == True, Staff.id != staff_id  # noqa: E712
        )
    ).all()
    return not others


def billed_for(pkg: Optional[Package], charges, attended: int) -> int:
    """The one place a case's billed total is decided.

    A daily-basis case bills what the patient actually attended; a package bills its
    fee. Add-ons and discounts are charge rows on top of either.
    """
    if pkg is None:
        return 0
    base = pkg.per_visit_rate * attended if pkg.per_visit_rate else pkg.price
    return base + sum(c.amount * c.quantity for c in charges if c.package_id == pkg.id)


def open_package(
    db: Session, patient_id: str, spec: PackageSpec, taken_by: Optional[str] = None
) -> Package:
    """Close any running package, open a new one with blank session rows."""
    for old in db.exec(
        select(Package).where(Package.patient_id == patient_id, Package.is_active == True)  # noqa: E712
    ).all():
        old.is_active = False
        db.add(old)

    start = spec.start_date or datetime.now(timezone.utc).date()
    pkg = Package(
        patient_id=patient_id,
        package_name=spec.package_name,
        validity_days=spec.validity_days,
        total_sessions=spec.total_sessions,
        payment_mode=spec.payment_mode,
        price=0 if spec.per_visit_rate else spec.price,
        per_visit_rate=spec.per_visit_rate,
        start_date=start,
        # Day 1 counts, so a 10-day package starting Monday ends on the second Wednesday.
        end_date=spec.end_date or start + timedelta(days=spec.validity_days - 1),
    )
    db.add(pkg)
    db.flush()
    for day in range(1, spec.total_sessions + 1):
        db.add(AttendanceLog(patient_id=patient_id, package_id=pkg.id, session_day=day))

    if spec.advance_amount:
        db.add(Payment(
            receipt_no=next_receipt_no(db),
            patient_id=patient_id,
            package_id=pkg.id,
            amount=spec.advance_amount,
            paid_on=start,
            mode=spec.payment_mode,
            note="Advance at registration",
            # Public sign-up has nobody to name; a staff-opened case does.
            recorded_by=taken_by or "Registration",
        ))
    return pkg


def household(db: Session, patient: Patient, clinical: bool = False) -> list[dict]:
    """Everyone else on this phone number, with how many courses of treatment they have had."""
    others = db.exec(
        select(Patient).where(Patient.phone_number == patient.phone_number, Patient.id != patient.id)
    ).all()
    rows = []
    for other in others:
        packages = db.exec(select(Package).where(Package.patient_id == other.id)).all()
        live = next((p for p in packages if p.is_active), None)
        done = 0
        if live:
            done = len(
                db.exec(
                    select(AttendanceLog).where(
                        AttendanceLog.package_id == live.id, AttendanceLog.is_verified == True  # noqa: E712
                    )
                ).all()
            )
        row = {
            "id": other.id,
            "full_name": other.full_name,
            "category": other.category,
            "cases": len(packages),
            "package_name": live.package_name if live else None,
            "completed_sessions": done,
            "total_sessions": live.total_sessions if live else 0,
        }
        if clinical:  # diagnoses belong to the admin console, not the patient portal
            row["diagnosis"] = other.diagnosis
        rows.append(row)
    return rows


def patient_payload(db: Session, patient: Patient, package_id: Optional[str] = None) -> dict:
    packages = db.exec(
        select(Package)
        .where(Package.patient_id == patient.id)
        .order_by(Package.created_at.desc())
    ).all()
    pkg = next(
        (p for p in packages if p.id == package_id),
        next((p for p in packages if p.is_active), packages[0] if packages else None),
    )
    by_package: dict[str, list[AttendanceLog]] = {}
    for log in db.exec(
        select(AttendanceLog)
        .where(AttendanceLog.patient_id == patient.id)
        .order_by(AttendanceLog.session_day)
    ).all():
        by_package.setdefault(log.package_id, []).append(log)

    receipts = db.exec(
        select(Payment).where(Payment.patient_id == patient.id).order_by(Payment.paid_on)
    ).all()
    paid = Counter()
    for receipt in receipts:
        paid[receipt.package_id] += receipt.amount

    charges = db.exec(
        select(Charge).where(Charge.patient_id == patient.id).order_by(Charge.charged_on)
    ).all()

    logs = by_package.get(pkg.id, []) if pkg else []
    done = sum(1 for log in logs if log.is_verified)
    billed = billed_for(pkg, charges, done)
    mates = household(db, patient)
    return {
        "patient": patient.model_dump(exclude={"password_hash"}),
        "package": pkg.model_dump() if pkg else None,
        # Every course of treatment this patient has had, newest first, with its own progress.
        "packages": [
            {
                **p.model_dump(),
                "completed_sessions": attended,
                "billed": owed,
                "paid": paid[p.id],
                "balance": owed - paid[p.id],
            }
            for p, attended, owed in (
                (p, attended, billed_for(p, charges, attended))
                for p in packages
                for attended in [sum(1 for log in by_package.get(p.id, []) if log.is_verified)]
            )
        ],
        "payments": [r.model_dump() for r in receipts if pkg and r.package_id == pkg.id],
        "charges": [c.model_dump() for c in charges if pkg and c.package_id == pkg.id],
        "billed": billed,
        "paid": paid[pkg.id] if pkg else 0,
        "balance": billed - paid[pkg.id] if pkg else 0,
        "sessions": [log.model_dump() for log in logs],
        "completed_sessions": done,
        "is_package_completed": bool(logs) and done >= len(logs),
        "household": mates,
        "shared_number_count": len(mates) + 1,
    }


@asynccontextmanager
async def lifespan(_: FastAPI):
    if SECRET_KEY == DEV_SECRET:
        if os.getenv("ENV", "").lower() in ("production", "prod"):
            raise RuntimeError(
                "SECRET_KEY is unset while ENV=production. Anyone who reads the source "
                "can forge a login token. Set SECRET_KEY in backend/.env before deploying."
            )
        print(
            "\n  !! SECRET_KEY is still the built-in development value."
            "\n     Anyone who knows it can forge a login token."
            "\n     Set SECRET_KEY in backend/.env before this faces the internet.\n"
        )
    SQLModel.metadata.create_all(engine)
    ensure_columns()
    backfill_identifiers()
    yield


app = FastAPI(title="B-Well Physiotherapy Clinic API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------- routes
@app.get("/api/v1/health")
def health():
    return {"status": "ok", "db": DATABASE_URL.split("://")[0]}


# Staff only. Registration creates a patient, a package and its charges in the
# clinic's live register — that is a counter activity, not something the internet
# gets to do. The public site raises an Inquiry instead.
@app.post("/api/v1/auth/register", status_code=201)
def register(body: RegisterIn, db: DB, staff: Me):
    housemates = db.exec(select(Patient).where(Patient.phone_number == body.phone_number)).all()

    # A shared household number is fine; the same person registered twice is not.
    if any(p.full_name == body.full_name for p in housemates):
        raise HTTPException(
            409,
            f"{body.full_name} is already registered on {body.phone_number}. "
            f"Use 'New case' on the admin page to start another package for them.",
        )

    # A random code the front desk prints once and hands over. Regenerated on the
    # (astronomically unlikely) chance it matches another person on this number, so
    # the code always picks exactly one patient at login.
    password = new_login_code()
    while any(pwd.verify(password, p.password_hash) for p in housemates):
        password = new_login_code()

    patient = Patient(
        **body.model_dump(exclude=set(PackageSpec.model_fields)),
        uhid=next_uhid(db),
        password_hash=pwd.hash(password),
    )
    db.add(patient)
    db.flush()
    open_package(db, patient.id, body)
    audit(db, staff, "patient.register", patient.uhid or "", f"registered {patient.full_name}")
    db.commit()
    db.refresh(patient)

    return {
        "message": "Registration successful",
        "login_id": patient.phone_number,
        "password": password,  # shown once, on the confirmation screen
        **patient_payload(db, patient),
    }


@app.post("/api/v1/auth/patient-login")
def patient_login(body: LoginIn, db: DB, request: Request):
    rate_limit(request, "patient-login", 20, 300)
    phone = re.sub(r"\D", "", body.phone_number)
    # One number can carry several patients; the password picks the person.
    housemates = db.exec(select(Patient).where(Patient.phone_number == phone)).all()
    patient = next(
        (p for p in housemates if pwd.verify(body.password.upper(), p.password_hash)), None
    )
    if not patient:
        raise HTTPException(401, "Invalid phone number or password")
    token = issue_token(patient.id, "patient", TOKEN_TTL_HOURS, phone=patient.phone_number)
    return {"access_token": token, "token_type": "bearer", **patient_payload(db, patient)}


@app.post("/api/v1/auth/staff-login")
def staff_login(body: StaffLoginIn, db: DB, request: Request):
    rate_limit(request, "staff-login", 20, 300)
    member = db.exec(
        select(Staff).where(Staff.username == body.username.strip().lower())
    ).first()
    # Same message either way — do not leak which usernames exist.
    if not member or not member.is_active or not pwd.verify(body.password, member.password_hash):
        raise HTTPException(401, "Invalid username or password")
    member.last_login_at = datetime.now(timezone.utc)
    db.add(member)
    audit(db, member, "login", member.username, "signed in")
    db.commit()
    db.refresh(member)
    return {
        "access_token": issue_token(member.id, "staff", STAFF_TTL_HOURS, role=member.role),
        "token_type": "bearer",
        "staff": member.model_dump(exclude={"password_hash"}),
    }


@app.get("/api/v1/staff/me")
def staff_me(member: Me):
    return member.model_dump(exclude={"password_hash"})


@app.post("/api/v1/staff/change-password")
def change_own_password(body: PasswordChange, db: DB, member: Me):
    """A staff member changes their OWN password — only if an owner enabled it for them;
    owners always may. Verifies the current password so someone walking up to a
    logged-in screen cannot silently take the account over."""
    if member.role != "OWNER" and not member.can_change_password:
        raise HTTPException(403, "Ask an owner to enable password changes for your account")
    if not pwd.verify(body.current_password, member.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    member.password_hash = pwd.hash(body.new_password)
    db.add(member)
    audit(db, member, "password.change", member.username, "changed their own password")
    db.commit()
    return {"changed": True}


@app.get("/api/v1/admin/audit", dependencies=[Depends(require_owner)])
def list_audit(db: DB, limit: int = Query(200, ge=1, le=1000), action: Optional[str] = None):
    """The 'who did what' log. Owner only."""
    stmt = select(AuditLog).order_by(AuditLog.at.desc())
    if action:
        stmt = stmt.where(AuditLog.action == action.strip())
    return [r.model_dump() for r in db.exec(stmt.limit(limit)).all()]


@app.post("/api/v1/auth/recover")
def recover_account(body: RecoverIn, db: DB, request: Request):
    """Break-glass recovery for a locked-out account, gated by the offline RECOVERY_KEY,
    not a session. Safe because the key is high-entropy and the call is rate-limited:
    without it nothing can be reset, so this is not the account-lockout hole a keyless
    public reset would be. Returns a fresh password to show once."""
    rate_limit(request, "recover", 5, 600)
    if not RECOVERY_KEY:
        raise HTTPException(404, "Account recovery is not configured")
    member = db.exec(select(Staff).where(Staff.username == body.username.strip().lower())).first()
    # Constant-time key check; one generic failure so a wrong key and a wrong user look alike.
    ok = secrets.compare_digest(body.recovery_key.strip(), RECOVERY_KEY)
    if not ok or not member or not member.is_active:
        raise HTTPException(401, "Recovery failed — check the username and recovery key")
    new = new_login_code(12)
    member.password_hash = pwd.hash(new)
    db.add(member)
    audit(db, SimpleNamespace(id=None, full_name="Recovery key"), "password.recover",
          member.username, "reset via offline recovery key")
    db.commit()
    return {"username": member.username, "password": new, "phone": member.phone}


@app.get("/api/v1/admin/staff", dependencies=[Depends(require_owner)])
def list_staff(db: DB):
    return [
        m.model_dump(exclude={"password_hash"})
        for m in db.exec(select(Staff).order_by(Staff.full_name)).all()
    ]


@app.post("/api/v1/admin/staff", status_code=201)
def create_staff(body: StaffIn, db: DB, owner: Owner):
    if db.exec(select(Staff).where(Staff.username == body.username)).first():
        raise HTTPException(409, f"Username {body.username} is already taken")
    member = Staff(
        username=body.username,
        full_name=body.full_name,
        role=body.role,
        phone=body.phone,
        can_change_password=body.can_change_password,
        password_hash=pwd.hash(body.password),
    )
    db.add(member)
    audit(db, owner, "staff.create", member.username, f"created {member.role} account")
    db.commit()
    db.refresh(member)
    return member.model_dump(exclude={"password_hash"})


@app.put("/api/v1/admin/staff/{staff_id}")
def update_staff(staff_id: str, body: StaffUpdate, db: DB, owner: Annotated[Staff, Depends(require_owner)]):
    member = db.get(Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")

    data = body.model_dump(exclude_unset=True)
    losing_owner = member.role == "OWNER" and (
        data.get("role") not in (None, "OWNER") or data.get("is_active") is False
    )
    if losing_owner and last_owner(db, member.id):
        raise HTTPException(422, "This is the only active owner — promote someone else first")
    if member.id == owner.id and data.get("is_active") is False:
        raise HTTPException(422, "You cannot deactivate yourself")

    pw = data.pop("password", None)
    if pw:
        member.password_hash = pwd.hash(pw)
    for key, value in data.items():
        setattr(member, key, value)
    db.add(member)
    if pw:
        audit(db, owner, "password.reset", member.username, f"reset password for {member.username}")
    if data:
        audit(db, owner, "staff.update", member.username, "changed " + ", ".join(sorted(data)))
    db.commit()
    db.refresh(member)
    return member.model_dump(exclude={"password_hash"})


@app.delete("/api/v1/admin/staff/{staff_id}", status_code=204)
def delete_staff(staff_id: str, db: DB, owner: Annotated[Staff, Depends(require_owner)]):
    member = db.get(Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    if member.id == owner.id:
        raise HTTPException(422, "You cannot delete your own account")
    if member.role == "OWNER" and last_owner(db, member.id):
        raise HTTPException(422, "This is the only active owner")
    audit(db, owner, "staff.delete", member.username, f"deleted {member.role} account")
    db.delete(member)
    db.commit()


@app.get("/api/v1/patient/me")
def me(
    db: DB,
    patient: Annotated[Patient, Depends(current_patient)],
    package_id: Optional[str] = None,
):
    """package_id lets a patient open one of their earlier courses of treatment."""
    if package_id and not db.exec(
        select(Package).where(Package.id == package_id, Package.patient_id == patient.id)
    ).first():
        raise HTTPException(404, "No such package for this patient")
    return patient_payload(db, patient, package_id)


def search_patients(q: str, only: Optional[set[str]] = None):
    """Shared filter behind the patient list and the workbook export.

    `only` narrows to a set of ids — how the date window gets applied to both at once.
    An empty set means the window matched nobody, and must return nobody.
    """
    stmt = select(Patient)
    term = q.strip()
    if term:
        stmt = stmt.where(
            Patient.full_name.like(f"%{term.upper()}%")
            | Patient.phone_number.like(f"%{term}%")
            # The UHID is what is printed on the card the patient hands over.
            | Patient.uhid.like(f"%{term.upper()}%")
        )
    if only is not None:
        stmt = stmt.where(Patient.id.in_(only))
    return stmt


def attended_logs(db: Session) -> list[AttendanceLog]:
    """Sessions that actually happened — verified, and carrying the day they happened."""
    return db.exec(
        select(AttendanceLog).where(
            AttendanceLog.is_verified == True,  # noqa: E712
            AttendanceLog.session_date != None,  # noqa: E711
        )
    ).all()


def visited_between(logs, date_from: Optional[date], date_to: Optional[date]) -> set[str]:
    """Who came in during the window. This is what "search by date" means to a clinic:
    not when someone registered, but when they were last on the table."""
    return {
        log.patient_id
        for log in logs
        if (not date_from or log.session_date >= date_from)
        and (not date_to or log.session_date <= date_to)
    }


@app.get("/api/v1/admin/patients", dependencies=[Depends(current_staff)])
def list_patients(
    db: DB,
    q: str = Query("", description="UHID, phone or name fragment"),
    date_from: Optional[date] = Query(None, alias="from", description="visited on or after"),
    date_to: Optional[date] = Query(None, alias="to", description="visited on or before"),
):
    """`from`/`to` search the treatment history: who was actually seen in that window."""
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, "'to' cannot be before 'from'")

    logs = attended_logs(db)
    windowed = bool(date_from or date_to)
    seen = visited_between(logs, date_from, date_to)
    patients = db.exec(
        search_patients(q, seen if windowed else None).order_by(Patient.created_at.desc())
    ).all()
    all_patients = db.exec(select(Patient)).all()

    # Last visit is lifetime — a clinic wants it even while looking at one month.
    # The visit count follows the window, so it answers "how often in this period".
    last_visit: dict[str, date] = {}
    visits = Counter()
    for log in logs:
        if log.session_date > last_visit.get(log.patient_id, date.min):
            last_visit[log.patient_id] = log.session_date
        if not windowed or log.patient_id in seen:
            if (not date_from or log.session_date >= date_from) and (
                not date_to or log.session_date <= date_to
            ):
                visits[log.patient_id] += 1

    # Progress is per running package, not lifetime — a returning patient starts at 0 again.
    active = {
        pkg.patient_id: pkg
        for pkg in db.exec(select(Package).where(Package.is_active == True)).all()  # noqa: E712
    }
    verified = Counter(
        log.patient_id
        for log in db.exec(select(AttendanceLog).where(AttendanceLog.is_verified == True)).all()  # noqa: E712
        if log.package_id == getattr(active.get(log.patient_id), "id", None)
    )
    on_phone = Counter(p.phone_number for p in all_patients)
    charges = db.exec(select(Charge)).all()
    paid = Counter()
    for receipt in db.exec(select(Payment)).all():
        paid[receipt.package_id] += receipt.amount

    def outstanding(patient_id: str) -> int:
        pkg = active.get(patient_id)
        return billed_for(pkg, charges, verified[patient_id]) - paid[pkg.id] if pkg else 0

    return {
        "stats": {
            "total": len(all_patients),
            # Counted from what the register actually holds, not from a fixed A/B/C:
            # the categories are the clinic's to define, and a retired one still has
            # patients filed under it.
            "by_category": dict(
                sorted(Counter(p.category for p in all_patients if p.category).items())
            ),
            "shared_numbers": sum(1 for n in on_phone.values() if n > 1),
        },
        "patients": [
            {
                **p.model_dump(exclude={"password_hash"}),
                "completed_sessions": verified[p.id],
                "total_sessions": getattr(active.get(p.id), "total_sessions", 0),
                "package_name": getattr(active.get(p.id), "package_name", None),
                "end_date": getattr(active.get(p.id), "end_date", None),
                "balance": outstanding(p.id),
                "shares_number": on_phone[p.phone_number] > 1,
                "last_visit": last_visit.get(p.id),
                "visits": visits[p.id],
            }
            for p in patients
        ],
    }


@app.get("/api/v1/admin/patients/{patient_id}", dependencies=[Depends(current_staff)])
def admin_patient_detail(patient_id: str, db: DB, package_id: Optional[str] = None):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    payload = patient_payload(db, patient, package_id)
    payload["shared_number_with"] = household(db, patient, clinical=True)
    return payload


@app.post(
    "/api/v1/admin/patients/{patient_id}/packages",
    status_code=201,
    dependencies=[Depends(current_staff)],
)
def start_new_case(patient_id: str, body: NewCaseIn, db: DB, member: Me):
    """Returning patient, new episode of care — same login, fresh package and sessions."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if body.diagnosis:
        patient.diagnosis = " ".join(body.diagnosis.split()).upper()
    if body.category:
        category = body.category.strip().upper()[:2]
        if not re.fullmatch(r"[A-Z0-9]{1,2}", category):
            raise HTTPException(422, "category must be 1-2 letters or digits")
        patient.category = category
    db.add(patient)
    open_package(db, patient.id, body, taken_by=member.full_name)
    db.commit()
    db.refresh(patient)
    return patient_payload(db, patient)


@app.put("/api/v1/admin/packages/{package_id}", dependencies=[Depends(current_staff)])
def update_package(package_id: str, body: PackageUpdate, db: DB):
    """Correct a package's name, price or dates after the fact — admin only."""
    pkg = db.get(Package, package_id)
    if not pkg:
        raise HTTPException(404, "Package not found")
    data = body.model_dump(exclude_unset=True)
    start = data.get("start_date", pkg.start_date)
    end = data.get("end_date", pkg.end_date)
    if start and end and end < start:
        raise HTTPException(422, "end_date cannot be before start_date")
    for key, value in data.items():
        setattr(pkg, key, value)
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


@app.post(
    "/api/v1/admin/packages/{package_id}/payments",
    status_code=201,
    dependencies=[Depends(current_staff)],
)
def record_payment(package_id: str, body: PaymentIn, db: DB, member: Me):
    """Log a receipt against a package — cash actually taken, not the agreed price."""
    pkg = db.get(Package, package_id)
    if not pkg:
        raise HTTPException(404, "Package not found")
    receipt = Payment(
        receipt_no=next_receipt_no(db),
        patient_id=pkg.patient_id,
        package_id=pkg.id,
        amount=body.amount,
        paid_on=body.paid_on or datetime.now(timezone.utc).date(),
        mode=body.mode,
        reference=body.reference,
        note=body.note,
        recorded_by=member.full_name,
    )
    db.add(receipt)
    audit(db, member, "payment.record", receipt.receipt_no or "", f"took \u20b9{receipt.amount} ({receipt.mode})")
    db.commit()
    db.refresh(receipt)
    return receipt


@app.delete("/api/v1/admin/payments/{payment_id}", status_code=204)
def delete_payment(payment_id: str, db: DB, member: Me):
    """Undo a mistyped receipt. A genuine refund is a negative payment, not a deletion."""
    receipt = db.get(Payment, payment_id)
    if not receipt:
        raise HTTPException(404, "Payment not found")
    audit(db, member, "payment.delete", receipt.receipt_no or "", f"deleted receipt for \u20b9{receipt.amount}")
    db.delete(receipt)
    db.commit()


# ------------------------------------------------------------- catalogue
# Read is open: the public registration page needs the plan list and its prices.
@app.get("/api/v1/catalogue")
def list_catalogue(db: DB, kind: Optional[str] = None, include_inactive: bool = False):
    stmt = select(CatalogueItem)
    if kind:
        stmt = stmt.where(CatalogueItem.kind == kind.strip().upper())
    if not include_inactive:
        stmt = stmt.where(CatalogueItem.is_active == True)  # noqa: E712
    return db.exec(stmt.order_by(CatalogueItem.sort_order, CatalogueItem.name)).all()


@app.post("/api/v1/admin/catalogue", status_code=201)
def create_catalogue_item(body: CatalogueIn, db: DB, owner: Owner):
    item = CatalogueItem(**body.model_dump())
    db.add(item)
    audit(db, owner, "catalogue.create", item.name, f"added {item.kind}")
    db.commit()
    db.refresh(item)
    return item


@app.put("/api/v1/admin/catalogue/{item_id}")
def update_catalogue_item(item_id: str, body: CatalogueUpdate, db: DB, owner: Owner):
    item = db.get(CatalogueItem, item_id)
    if not item:
        raise HTTPException(404, "Catalogue item not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.add(item)
    audit(db, owner, "catalogue.update", item.name, "updated item")
    db.commit()
    db.refresh(item)
    return item


@app.delete("/api/v1/admin/catalogue/{item_id}", status_code=204)
def delete_catalogue_item(item_id: str, db: DB, owner: Owner):
    """Retires an item. Cases already booked on it keep their own copied name and price."""
    item = db.get(CatalogueItem, item_id)
    if not item:
        raise HTTPException(404, "Catalogue item not found")
    audit(db, owner, "catalogue.delete", item.name, f"retired {item.kind}")
    db.delete(item)
    db.commit()


# ------------------------------------------------------------- letterhead
@app.get("/api/v1/clinic")
def get_clinic(db: DB):
    """Open on purpose: it is the letterhead, and a patient printing their own
    treatment record needs it too. Nothing here is confidential."""
    profile = clinic_profile(db)
    db.commit()  # first call on a fresh database is what creates the row
    db.refresh(profile)  # commit expires it, and an expired row serialises to {}
    return profile


@app.put("/api/v1/admin/clinic")
def update_clinic(body: ClinicUpdate, db: DB, owner: Owner):
    profile = clinic_profile(db)
    data = body.model_dump(exclude_unset=True)

    seq = data.pop("receipt_seq", None)
    if seq is not None and seq != profile.receipt_seq:
        if seq < profile.receipt_seq:
            raise HTTPException(
                422,
                f"Receipt numbers only move forward — {profile.receipt_prefix}-"
                f"{profile.receipt_seq:05d} has already been issued to a patient",
            )
        profile.receipt_seq = seq

    for key, value in data.items():
        setattr(profile, key, value)
    db.add(profile)
    audit(db, owner, "clinic.update", "", "updated clinic settings")
    db.commit()
    db.refresh(profile)
    return profile


# ------------------------------------------------------------- inquiries
# A callback request from the public site: open to create, staff to work.

# A double-tap on a slow connection should not put the same person on the board twice.
DUPLICATE_WINDOW = timedelta(minutes=10)
OPEN_STATUS = ("NEW", "CONTACTED")


@app.post("/api/v1/inquiries", status_code=201)
def create_inquiry(body: InquiryIn, db: DB, request: Request):
    """The only write endpoint with no login in front of it, so it is deliberately
    dull: it records a callback request and nothing else. It books no appointment,
    creates no patient, and hands back no clinic data."""
    rate_limit(request, "inquiry", 10, 600)
    recent = db.exec(
        select(Inquiry)
        .where(
            Inquiry.phone_number == body.phone_number,
            Inquiry.status == "NEW",
            Inquiry.created_at >= datetime.now(timezone.utc) - DUPLICATE_WINDOW,
        )
        .order_by(Inquiry.created_at.desc())
    ).first()
    row = recent or Inquiry(full_name=body.full_name, phone_number=body.phone_number)
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    # An acknowledgement, not the row — none of it is the sender's to read back.
    return {"received": True, "reference": row.id[:8].upper()}


@app.get("/api/v1/admin/inquiries", dependencies=[Depends(current_staff)])
def list_inquiries(
    db: DB,
    status: Optional[str] = Query(None, description="NEW | CONTACTED | BOOKED | CLOSED"),
    days: int = Query(30, ge=1, le=365, description="how far back to show settled ones"),
):
    """The front desk's callback list.

    The window only trims what is already settled. Anything still open stays on the
    board however old it is, because "who did we never ring back" is the whole point
    of keeping these.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = select(Inquiry).where(
        (Inquiry.created_at >= since) | (Inquiry.status.in_(OPEN_STATUS))  # type: ignore[attr-defined]
    )
    if status:
        stmt = stmt.where(Inquiry.status == status.strip().upper())
    rows = db.exec(stmt.order_by(Inquiry.created_at.desc())).all()  # type: ignore[arg-type]
    return {
        "inquiries": rows,
        "counts": {s: sum(1 for r in rows if r.status == s) for s in INQUIRY_STATUS},
    }


@app.patch("/api/v1/admin/inquiries/{inquiry_id}")
def update_inquiry(inquiry_id: str, body: InquiryUpdate, db: DB, member: Me):
    """Whoever moves it owns it — the name is stamped so the board says who called."""
    row = db.get(Inquiry, inquiry_id)
    if not row:
        raise HTTPException(404, "Unknown inquiry")
    if body.status is not None:
        row.status = body.status
    if body.note is not None:
        row.note = body.note
    row.handled_by = member.full_name
    row.handled_at = datetime.now(timezone.utc)
    db.add(row)
    audit(db, member, "inquiry.update", row.full_name, f"set status {row.status}")
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------- billing
# Standard receivables ageing. The last bucket is open-ended.
AGE_BUCKETS = ((30, "0–30 days"), (60, "31–60 days"), (90, "61–90 days"))


def case_numbers(packages) -> dict[str, int]:
    """A patient's packages numbered 1, 2, 3… in the order they were booked."""
    per_patient: dict[str, list[Package]] = {}
    for pkg in packages:
        per_patient.setdefault(pkg.patient_id, []).append(pkg)
    return {
        pkg.id: n
        for group in per_patient.values()
        for n, pkg in enumerate(sorted(group, key=lambda k: k.created_at), start=1)
    }


@app.get("/api/v1/admin/billing", dependencies=[Depends(require_owner)])
def billing_console(
    db: DB,
    date_from: Optional[date] = Query(None, alias="from"),
    date_to: Optional[date] = Query(None, alias="to"),
):
    """The owner's money screen, and the data behind the printed collection report.

    Collections are counted on the day the money arrived. The dues ledger is deliberately
    *not* windowed: a debt raised in March is still owed in June, so showing it only
    inside its own month is how clinics lose track of it.
    """
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, "'to' cannot be before 'from'")
    today = datetime.now(timezone.utc).date()

    patients = {p.id: p for p in db.exec(select(Patient)).all()}
    packages = {k.id: k for k in db.exec(select(Package)).all()}
    charges = db.exec(select(Charge)).all()
    attended = Counter(
        log.package_id for log in db.exec(select(AttendanceLog)).all() if log.is_verified
    )
    receipts = db.exec(select(Payment).order_by(Payment.paid_on, Payment.created_at)).all()
    case_no = case_numbers(packages.values())

    paid = Counter()
    for money in receipts:
        paid[money.package_id] += money.amount

    in_window = [
        money
        for money in receipts
        if (not date_from or money.paid_on >= date_from)
        and (not date_to or money.paid_on <= date_to)
    ]

    by_mode, mode_count, by_day, day_count = Counter(), Counter(), Counter(), Counter()
    for money in in_window:
        by_mode[money.mode] += money.amount
        mode_count[money.mode] += 1
        by_day[money.paid_on] += money.amount
        day_count[money.paid_on] += 1

    def who(pkg: Package) -> dict:
        patient = patients[pkg.patient_id]
        return {
            "patient_id": patient.id,
            "uhid": patient.uhid,
            "full_name": patient.full_name,
            "phone_number": patient.phone_number,
            "package_id": pkg.id,
            "package_name": pkg.package_name,
            "case_no": case_no[pkg.id],
        }

    def bucket(days: int) -> str:
        return next((label for limit, label in AGE_BUCKETS if days <= limit), "Over 90 days")

    dues, ageing_amount, ageing_cases, unbilled = [], Counter(), Counter(), []
    for pkg in packages.values():
        if pkg.patient_id not in patients:
            continue
        billed = billed_for(pkg, charges, attended[pkg.id])
        balance = billed - paid[pkg.id]
        # A running case with no fee and no rate is not free — somebody skipped a box.
        if pkg.is_active and not pkg.price and not pkg.per_visit_rate:
            unbilled.append({**who(pkg), "start_date": pkg.start_date, "sessions": attended[pkg.id]})
        if balance <= 0:
            continue
        # Aged from the day the case opened — that is when the clinic's claim arose.
        age = (today - pkg.start_date).days
        label = bucket(age)
        ageing_amount[label] += balance
        ageing_cases[label] += 1
        dues.append(
            {
                **who(pkg),
                "start_date": pkg.start_date,
                "end_date": pkg.end_date,
                "is_active": pkg.is_active,
                "billed": billed,
                "paid": paid[pkg.id],
                "balance": balance,
                "days": age,
                "bucket": label,
                "last_paid_on": max(
                    (m.paid_on for m in receipts if m.package_id == pkg.id), default=None
                ),
            }
        )
    dues.sort(key=lambda r: -r["days"])

    billed_lifetime = sum(billed_for(k, charges, attended[k.id]) for k in packages.values())
    collected_lifetime = sum(money.amount for money in receipts)

    return {
        "from": date_from,
        "to": date_to,
        "generated_at": datetime.now(timezone.utc),
        "totals": {
            "collected": sum(money.amount for money in in_window),
            "receipts": len(in_window),
            "refunded": -sum(money.amount for money in in_window if money.amount < 0),
            "collected_today": sum(m.amount for m in receipts if m.paid_on == today),
            "billed_lifetime": billed_lifetime,
            "collected_lifetime": collected_lifetime,
            "outstanding": sum(row["balance"] for row in dues),
        },
        "by_mode": [
            {"mode": mode, "receipts": mode_count[mode], "amount": amount}
            for mode, amount in by_mode.most_common()
        ],
        "by_day": [
            {"date": day, "receipts": day_count[day], "amount": by_day[day]}
            for day in sorted(by_day)
        ],
        "ledger": [
            {
                **who(packages[money.package_id]),
                "id": money.id,
                "receipt_no": money.receipt_no,
                "paid_on": money.paid_on,
                "amount": money.amount,
                "mode": money.mode,
                "reference": money.reference,
                "note": money.note,
                "recorded_by": money.recorded_by,
            }
            for money in in_window
            if money.package_id in packages and packages[money.package_id].patient_id in patients
        ],
        "ageing": [
            {"bucket": label, "cases": ageing_cases[label], "amount": ageing_amount[label]}
            for label in [b for _, b in AGE_BUCKETS] + ["Over 90 days"]
            if ageing_cases[label]
        ],
        "outstanding": dues,
        "unbilled": unbilled,
    }


# --------------------------------------------------------- charges & edits
@app.post(
    "/api/v1/admin/packages/{package_id}/charges",
    status_code=201,
    dependencies=[Depends(current_staff)],
)
def add_charge(package_id: str, body: ChargeIn, db: DB):
    """Bill an add-on therapy onto a case, or a negative amount as a discount."""
    pkg = db.get(Package, package_id)
    if not pkg:
        raise HTTPException(404, "Package not found")
    charge = Charge(
        patient_id=pkg.patient_id,
        package_id=pkg.id,
        description=body.description,
        amount=body.amount,
        quantity=body.quantity,
        charged_on=body.charged_on or datetime.now(timezone.utc).date(),
    )
    db.add(charge)
    db.commit()
    db.refresh(charge)
    return charge


@app.delete(
    "/api/v1/admin/charges/{charge_id}", status_code=204, dependencies=[Depends(current_staff)]
)
def delete_charge(charge_id: str, db: DB):
    charge = db.get(Charge, charge_id)
    if not charge:
        raise HTTPException(404, "Charge not found")
    db.delete(charge)
    db.commit()


@app.put("/api/v1/admin/patients/{patient_id}")
def update_patient(patient_id: str, body: PatientUpdate, db: DB, staff: Me):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("full_name") is not None and not re.search(r"[A-Z]", data["full_name"]):
        raise HTTPException(422, "full_name must contain letters")
    for key, value in data.items():
        setattr(patient, key, value)
    db.add(patient)
    if data:
        audit(db, staff, "patient.update", patient.uhid or "", "changed " + ", ".join(sorted(data)))
    db.commit()
    db.refresh(patient)
    return patient_payload(db, patient)


@app.post("/api/v1/admin/patients/{patient_id}/reset-login")
def reset_patient_login(patient_id: str, db: DB, staff: Me):
    """Staff cannot see a patient's code — it is hashed — but they can issue a new
    one when a patient has lost theirs. Regenerated so it stays unique among everyone
    on the same phone number, since the code is what picks one person at login."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    housemates = db.exec(
        select(Patient).where(
            Patient.phone_number == patient.phone_number, Patient.id != patient.id
        )
    ).all()
    code = new_login_code()
    while any(pwd.verify(code, h.password_hash) for h in housemates):
        code = new_login_code()
    patient.password_hash = pwd.hash(code)
    db.add(patient)
    audit(db, staff, "patient.reset_login", patient.uhid or "", f"reissued portal login for {patient.full_name}")
    db.commit()
    return {"login_id": patient.phone_number, "password": code}


@app.post(
    "/api/v1/admin/packages/{package_id}/sessions",
    status_code=201,
    dependencies=[Depends(current_staff)],
)
def add_sessions(package_id: str, db: DB, count: int = Query(1, ge=1, le=50)):
    """Append visits to a case — how a daily-basis patient's card grows as they come."""
    pkg = db.get(Package, package_id)
    if not pkg:
        raise HTTPException(404, "Package not found")
    existing = db.exec(
        select(AttendanceLog).where(AttendanceLog.package_id == pkg.id)
    ).all()
    start = max((log.session_day for log in existing), default=0)
    if start + count > 100:
        raise HTTPException(422, "a case cannot hold more than 100 sessions")
    for day in range(start + 1, start + count + 1):
        db.add(AttendanceLog(patient_id=pkg.patient_id, package_id=pkg.id, session_day=day))
    pkg.total_sessions = start + count
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return patient_payload(db, db.get(Patient, pkg.patient_id))


@app.get("/api/v1/admin/today", dependencies=[Depends(current_staff)])
def today_board(db: DB):
    """The front desk's morning screen: who is in, what is owed, what is running out."""
    today = datetime.now(timezone.utc).date()
    patients = {p.id: p for p in db.exec(select(Patient)).all()}
    packages = {k.id: k for k in db.exec(select(Package)).all()}
    charges = db.exec(select(Charge)).all()
    logs = db.exec(select(AttendanceLog)).all()

    attended = Counter(log.package_id for log in logs if log.is_verified)
    paid = Counter()
    for receipt in db.exec(select(Payment)).all():
        paid[receipt.package_id] += receipt.amount

    def row(pkg: Package) -> dict:
        billed = billed_for(pkg, charges, attended[pkg.id])
        patient = patients[pkg.patient_id]
        return {
            "patient_id": patient.id,
            "full_name": patient.full_name,
            "phone_number": patient.phone_number,
            "package_id": pkg.id,
            "package_name": pkg.package_name,
            "end_date": pkg.end_date,
            "completed_sessions": attended[pkg.id],
            "total_sessions": pkg.total_sessions,
            "billed": billed,
            "paid": paid[pkg.id],
            "balance": billed - paid[pkg.id],
        }

    live = [k for k in packages.values() if k.is_active]
    return {
        "date": today,
        "scheduled_today": sorted(
            (
                {
                    **row(packages[log.package_id]),
                    "session_day": log.session_day,
                    "is_verified": log.is_verified,
                    "attended_by": log.attended_by,
                }
                for log in logs
                if log.session_date == today and log.package_id in packages
            ),
            key=lambda r: (r["is_verified"], r["full_name"]),
        ),
        "expiring_soon": sorted(
            (
                row(k)
                for k in live
                if k.end_date and today <= k.end_date <= today + timedelta(days=7)
            ),
            key=lambda r: r["end_date"],
        ),
        "outstanding": sorted(
            (r for r in (row(k) for k in live) if r["balance"] > 0),
            key=lambda r: -r["balance"],
        ),
        "collected_today": sum(
            y.amount for y in db.exec(select(Payment).where(Payment.paid_on == today)).all()
        ),
    }


DATE_FMT = "dd-mmm-yyyy"
RUPEES_FMT = '"₹" #,##0'

# Each column: header, value(row), column width, Excel number format.
# `row` is a namespace: .p patient, .k package, .d sessions done, .s session log.
PATIENT_COLUMNS = [
    ("UHID", lambda r: r.p.uhid or "", 12, "@"),
    ("Patient Name", lambda r: r.p.full_name, 26, None),
    ("Phone (Login ID)", lambda r: r.p.phone_number, 16, "@"),
    ("Alt Phone", lambda r: r.p.alt_phone or "", 14, "@"),
    ("Age", lambda r: r.p.age, 6, "0"),
    ("Gender", lambda r: r.p.gender, 10, None),
    ("Email", lambda r: r.p.email or "", 28, None),
    ("Address", lambda r: r.p.address or "", 44, None),
    ("Referring Doctor", lambda r: r.p.referring_doctor or "", 20, None),
    ("Diagnosis", lambda r: r.p.diagnosis or "", 34, None),
    ("Requirements", lambda r: r.p.requirements or "", 30, None),
    ("Category", lambda r: r.p.category, 10, None),
    ("Package", lambda r: r.k.package_name if r.k else "", 28, None),
    ("Start Date", lambda r: r.k.start_date if r.k else "", 14, DATE_FMT),
    ("End Date", lambda r: (r.k.end_date or "") if r.k else "", 14, DATE_FMT),
    ("Sessions Done", lambda r: r.d if r.k else "", 14, "0"),
    ("Total Sessions", lambda r: r.k.total_sessions if r.k else "", 14, "0"),
    ("Status", lambda r: "" if not r.k else "COMPLETED" if r.d >= r.k.total_sessions else "ONGOING", 12, None),
    ("Per Visit Rate", lambda r: (r.k.per_visit_rate or "") if r.k else "", 14, RUPEES_FMT),
    ("Billed (INR)", lambda r: r.b if r.k else "", 14, RUPEES_FMT),
    ("Paid (INR)", lambda r: r.paid if r.k else "", 14, RUPEES_FMT),
    ("Balance (INR)", lambda r: (r.b - r.paid) if r.k else "", 14, RUPEES_FMT),
    ("Payment Mode", lambda r: r.k.payment_mode if r.k else "", 14, None),
    ("Registered On", lambda r: r.p.created_at.date(), 15, DATE_FMT),
]

# One row per booked session, across every package — the clinic's day book.
SESSION_COLUMNS = [
    ("UHID", lambda r: r.p.uhid or "", 12, "@"),
    ("Patient Name", lambda r: r.p.full_name, 26, None),
    ("Phone", lambda r: r.p.phone_number, 16, "@"),
    ("Category", lambda r: r.p.category, 10, None),
    ("Case", lambda r: r.n, 7, "0"),
    ("Package", lambda r: r.k.package_name, 28, None),
    ("Package Started", lambda r: r.k.start_date, 16, DATE_FMT),
    ("Day", lambda r: r.s.session_day, 6, "0"),
    ("Session Date", lambda r: r.s.session_date or "", 14, DATE_FMT),
    ("Attended By", lambda r: r.s.attended_by or "", 22, None),
    ("Protocol Note", lambda r: r.s.protocol_note or "", 46, None),
    ("Status", lambda r: "COMPLETED" if r.s.is_verified else "PENDING", 12, None),
]


# One row per receipt — what the clinic actually took, and when.
PAYMENT_COLUMNS = [
    ("Receipt No", lambda r: r.y.receipt_no or "", 14, "@"),
    ("Receipt Date", lambda r: r.y.paid_on, 15, DATE_FMT),
    ("UHID", lambda r: r.p.uhid or "", 12, "@"),
    ("Patient Name", lambda r: r.p.full_name, 26, None),
    ("Phone", lambda r: r.p.phone_number, 16, "@"),
    ("Case", lambda r: r.n, 7, "0"),
    ("Package", lambda r: r.k.package_name, 28, None),
    ("Amount (INR)", lambda r: r.y.amount, 15, RUPEES_FMT),
    ("Mode", lambda r: r.y.mode, 13, None),
    ("Reference", lambda r: r.y.reference or "", 22, None),
    ("Taken By", lambda r: r.y.recorded_by or "", 20, None),
    ("Note", lambda r: r.y.note or "", 30, None),
]

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def write_summary(sheet, sections) -> None:
    """A section is (title, column headers or None, rows, per-column number formats)."""
    for col, width in zip("ABCDE", (36, 22, 16, 16, 16)):
        sheet.column_dimensions[col].width = width

    line = 1
    for title, headers, rows, formats in sections:
        for col in range(1, 6):
            cell = sheet.cell(row=line, column=col, value=title if col == 1 else None)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="0F766E")
        line += 1

        if headers:
            for col, name in enumerate(headers, start=1):
                sheet.cell(row=line, column=col, value=name).font = Font(bold=True)
            line += 1

        for row in rows:
            for col, value in enumerate(row, start=1):
                fmt = formats[col - 1] if col - 1 < len(formats) else None
                if isinstance(value, tuple):  # a cell may override its column's format
                    value, fmt = value
                cell = sheet.cell(row=line, column=col, value=value)
                if fmt and not isinstance(value, str):
                    cell.number_format = fmt
            line += 1
        line += 1  # a blank row between sections

    note = sheet.cell(
        row=line,
        column=1,
        value="Billed is the agreed package value; Collected is the sum of receipts on the "
        "Payments sheet. A refund is recorded as a negative receipt.",
    )
    note.font = Font(italic=True, color="64748B")


def write_sheet(sheet, columns, rows) -> None:
    """Header styling, widths, typed cells, frozen header and autofilter."""
    for col, (name, _value, width, _fmt) in enumerate(columns, start=1):
        cell = sheet.cell(row=1, column=col, value=name)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0F766E")  # teal-700, matching the console
        cell.alignment = Alignment(vertical="center")
        sheet.column_dimensions[get_column_letter(col)].width = width

    for index, row in enumerate(rows, start=2):
        for col, (_name, value, _width, number_format) in enumerate(columns, start=1):
            cell = sheet.cell(row=index, column=col, value=value(row))
            if number_format and cell.value != "":
                cell.number_format = number_format

    sheet.freeze_panes = "A2"  # header stays put while scrolling
    sheet.auto_filter.ref = sheet.dimensions


@app.get("/api/v1/admin/export.xlsx", dependencies=[Depends(current_staff)])
def export_patients(
    db: DB,
    q: str = Query("", description="same filter as the patient list"),
    date_from: Optional[date] = Query(None, alias="from", description="earliest session date"),
    date_to: Optional[date] = Query(None, alias="to", description="latest session date"),
):
    """Patient register as a real .xlsx workbook: one sheet of patients, one of sessions.

    `from`/`to` narrow the Sessions sheet to a window — a month's day book, say. The
    Patients sheet stays the whole register, so progress totals still read true.
    """
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, "'to' cannot be before 'from'")

    # Same window as the console: the Patients sheet is the people the search found,
    # not the whole register, so the file matches the list it was exported from.
    seen = visited_between(attended_logs(db), date_from, date_to)
    patients = db.exec(
        search_patients(q, seen if (date_from or date_to) else None)
        .order_by(Patient.full_name)
    ).all()
    wanted = {p.id for p in patients}

    # ponytail: reads every package and log, then filters in memory. Fine at clinic scale;
    # switch to .in_(wanted) queries if this ever runs over six figures of sessions.
    packages = [p for p in db.exec(select(Package)).all() if p.patient_id in wanted]
    logs = [x for x in db.exec(select(AttendanceLog)).all() if x.patient_id in wanted]
    receipts = [y for y in db.exec(select(Payment)).all() if y.patient_id in wanted]
    charges = [c for c in db.exec(select(Charge)).all() if c.patient_id in wanted]

    live = {pkg.patient_id: pkg for pkg in packages if pkg.is_active}
    done = Counter(
        log.patient_id
        for log in logs
        if log.is_verified and log.package_id == getattr(live.get(log.patient_id), "id", None)
    )
    paid_by_package = Counter()
    for y in receipts:
        paid_by_package[y.package_id] += y.amount

    book = Workbook()
    book.active.title = "Patients"
    write_sheet(
        book.active,
        PATIENT_COLUMNS,
        [
            SimpleNamespace(
                p=p,
                k=live.get(p.id),
                d=done[p.id],
                b=billed_for(live.get(p.id), charges, done[p.id]),
                paid=paid_by_package[getattr(live.get(p.id), "id", "")],
            )
            for p in patients
        ],
    )

    by_id = {p.id: p for p in patients}
    package_by_id = {k.id: k for k in packages}

    # Two packages can share a name and a start date, so the sheet needs the case
    # number to tell them apart.
    case_no = case_numbers(packages)

    # A window asks for sessions that happened, so unattended rows (no date) drop out.
    # `logs` stays unfiltered above — the Patients sheet counts a patient's whole package.
    in_window = [
        log
        for log in logs
        if not (date_from or date_to)
        or (
            log.session_date
            and (not date_from or log.session_date >= date_from)
            and (not date_to or log.session_date <= date_to)
        )
    ]
    session_rows = [
        SimpleNamespace(
            p=by_id[log.patient_id], k=package_by_id[log.package_id], s=log,
            n=case_no[log.package_id],
        )
        for log in in_window
        if log.package_id in package_by_id
    ]
    # ids break the ties: two patients can share a name, and two packages a start date.
    session_rows.sort(key=lambda r: (r.p.full_name, r.p.id, r.n, r.s.session_day))
    write_sheet(book.create_sheet("Sessions"), SESSION_COLUMNS, session_rows)

    # Receipts are windowed on the day the money came in — that is the month's takings.
    receipts_in_window = [
        y
        for y in receipts
        if (not date_from or y.paid_on >= date_from) and (not date_to or y.paid_on <= date_to)
    ]
    payment_rows = [
        SimpleNamespace(
            p=by_id[y.patient_id], k=package_by_id[y.package_id], y=y, n=case_no[y.package_id]
        )
        for y in receipts_in_window
        if y.package_id in package_by_id
    ]
    payment_rows.sort(key=lambda r: (r.y.paid_on, r.p.full_name, r.n))
    write_sheet(book.create_sheet("Payments"), PAYMENT_COLUMNS, payment_rows)

    # --------------------------------------------------------------- summary
    attended = sum(1 for log in logs if log.is_verified)
    on_phone = Counter(p.phone_number for p in patients)
    attended_by_package = Counter(log.package_id for log in logs if log.is_verified)
    by_package = Counter()
    sessions_by_package = Counter()
    value_by_package = Counter()
    for k in packages:
        by_package[k.package_name] += 1
        sessions_by_package[k.package_name] += k.total_sessions
        value_by_package[k.package_name] += billed_for(k, charges, attended_by_package[k.id])

    # Money split by how it actually came in, not by the mode pencilled on the package.
    receipts_by_mode = Counter()
    taken_by_mode = Counter()
    for y in receipts:
        receipts_by_mode[y.mode] += 1
        taken_by_mode[y.mode] += y.amount

    billed = sum(billed_for(k, charges, attended_by_package[k.id]) for k in packages)
    collected = sum(y.amount for y in receipts)

    sessions_block = [
        ["Sessions booked", len(logs)],
        ["Completed", attended],
        ["Pending", len(logs) - attended],
        ["Completion rate", ((attended / len(logs)) if logs else 0, "0.0%")],
    ]
    window_label = f"({date_from or 'start'} to {date_to or 'today'})"
    if date_from or date_to:
        sessions_block.append([f"In window {window_label}", len(in_window)])

    revenue_block = [
        ["Billed (agreed package value)", billed],
        ["Collected (receipts)", collected],
        ["Outstanding", billed - collected],
        ["Collection rate", ((collected / billed) if billed else 0, "0.0%")],
        # whole rupees: a fraction of a rupee is noise, and floats do not
        # survive the xlsx round trip exactly.
        ["Average billed per case", round(billed / len(packages)) if packages else 0],
    ]
    if date_from or date_to:
        revenue_block.append(
            [f"Collected in window {window_label}", sum(y.amount for y in receipts_in_window)]
        )

    write_summary(
        book.create_sheet("Summary", 0),
        [
            ("PATIENTS", None, [
                ["Total patients", len(patients)],
                ["Category A", sum(1 for p in patients if p.category == "A")],
                ["Category B", sum(1 for p in patients if p.category == "B")],
                ["Category C", sum(1 for p in patients if p.category == "C")],
                ["Shared phone numbers", sum(1 for n in on_phone.values() if n > 1)],
            ], [None, "0"]),
            ("CASES", None, [
                ["Total cases (packages)", len(packages)],
                ["Running", len(live)],
                ["Closed", len(packages) - len(live)],
            ], [None, "0"]),
            ("SESSIONS", None, sessions_block, [None, "0"]),
            ("REVENUE", None, revenue_block, [None, RUPEES_FMT]),
            ("RECEIPTS BY MODE", ["Mode", "Receipts", "Collected"], [
                [mode, count, taken_by_mode[mode]] for mode, count in receipts_by_mode.most_common()
            ] or [["No receipts recorded", 0, 0]], [None, "0", RUPEES_FMT]),
            ("BY PACKAGE", ["Package", "Cases", "Sessions", "Billed", "Collected"], [
                [
                    name,
                    count,
                    sessions_by_package[name],
                    value_by_package[name],
                    sum(paid_by_package[k.id] for k in packages if k.package_name == name),
                ]
                for name, count in by_package.most_common()
            ], [None, "0", "0", RUPEES_FMT, RUPEES_FMT]),
        ],
    )
    book.active = 0  # open on the summary

    buffer = io.BytesIO()
    book.save(buffer)
    # Name the file after the window, so a folder of monthly exports sorts itself.
    span = (
        f"{date_from or 'start'}_to_{date_to or 'today'}"
        if (date_from or date_to)
        else str(datetime.now(timezone.utc).date())
    )
    return Response(
        content=buffer.getvalue(),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="bwell-patients-{span}.xlsx"'},
    )


@app.put("/api/v1/admin/attendance/{session_id}", dependencies=[Depends(current_staff)])
def update_attendance(session_id: str, body: AttendanceIn, db: DB):
    log = db.get(AttendanceLog, session_id)
    if not log:
        raise HTTPException(404, "Session not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("is_verified") and data.get("session_date") is None and log.session_date is None:
        data["session_date"] = datetime.now(timezone.utc).date()
    for key, value in data.items():
        setattr(log, key, value)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
