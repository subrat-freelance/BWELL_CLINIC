# B-Well Physiotherapy Clinic

Patient portal + clinic management. FastAPI/SQLModel backend, Next.js (App Router) frontend.

```
backend/    main.py (models, schemas, auth, routes), seed.py, test_app.py
frontend/   app/{page,login,portal,register,admin}, lib/api.ts
```

## Run

```bash
# backend  -> http://127.0.0.1:8000  (docs at /docs)
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # Linux/mac: .venv/bin/pip
.venv/Scripts/python seed.py --reset        # 60 demo patients: 24 A / 20 B / 16 C
.venv/Scripts/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# frontend -> http://localhost:3000
cd frontend
npm install && npm run dev
```

Demo logins — both on the **same phone number**, to exercise the shared-number flow:

| phone | password | who |
|---|---|---|
| `9348820192` | `JYOT9348` | JYOTIRREKHA MANTRI — Category C, 6/10 sessions done |
| `9348820192` | `RAJE9348` | RAJESH MANTRI — finished a 10-day package, now on a 20-day case |

## Inquiries from the public site

The appointment form on `/` is a **request, not a booking**. Submitting it does two things:
it POSTs to `/api/v1/inquiries`, which puts the person on the clinic's callback board, and it
opens a WhatsApp message with the same details. Neither confirms an appointment, and the form
says so — a patient told "slot reserved" will travel to a clinic that has never heard of them.

`POST /api/v1/inquiries` is the only write endpoint with no login in front of it, so it is
deliberately dull: it records a callback request, books nothing, creates no patient, and returns
`{"received": true, "reference": "..."}` rather than any clinic data. Names and numbers are
normalised exactly as `/auth/register` does them, free text is collapsed and capped at 500
characters, and a repeat from the same number within ten minutes updates the open row instead of
adding a second one — a double-tap on a slow connection should not put someone on the board twice.

**Admin → Inquiries** (`/admin/inquiries`) is the board. It is **staff-wide, not owner-only**:
ringing people back is the front desk's job, so it sits outside the owner gate that Billing and
Rates sit behind. Each row shows how long the person has waited, what they asked for, and a tap-to-call
and WhatsApp link. Marking one `Called back` / `Came in` / `Closed` stamps who did it, and a note
records what happened. A count of everyone not yet rung back rides on the Inquiries link in the
admin header.

The date window only trims what is already settled: anything still `NEW` or `CONTACTED` stays on
the board however old it is, because *"who did we never call back"* is the whole reason for keeping
these.

## The public site

`/` is the clinic's public page: hero, specialities, pain navigator, treatments, session estimator,
physiotherapists, address and FAQ. It is the only part of the app a stranger sees, so it is the only
part where a wrong fact is a business problem rather than a bug.

Every clinic fact on it comes from one file, **`frontend/lib/clinic.ts`**, which is sourced from the
clinic's own Google Business listing and the signboard photographed on it — address, both phone
numbers, consultation timings, the four specialities, the two physiotherapists and their
qualifications, the Google rating, the coordinates and the plus code. The rule in that file is that
nothing in it may be a guess: a physiotherapy clinic is a clinical establishment, and an invented
registration number, council number, certification, insurance tie-up or outcome percentage on its
public site is a regulatory problem, not a copywriting one. If the clinic has not published a value,
it is absent rather than approximated.

Two consequences worth knowing:

- **There is no aggregate review count in the structured data.** Review counts belong to Google. A
  count the site invents for itself is a structured-data violation that gets the listing penalised.
- **The appointment form does not book anything.** There is no appointment API, so it composes the
  patient's details into a WhatsApp message to the clinic and says plainly that nothing is confirmed
  until the clinic calls back. A form that says "slot reserved" without a booking behind it sends a
  patient in pain to a clinic that has never heard of them.

The logo (`public/logo-wordmark.png`, `public/logo-mark.png`, `app/icon.png`) is cropped from the
clinic's signboard. `public/clinic-photo.jpg` is that signboard, kept because it is the source for
every fact above.

The letterhead on **printed** documents is separate — it lives in the `Clinic` row and is edited at
Admin → Settings → Letterhead, because the owner has to be able to correct it without a deploy.
`frontend/lib/clinic.ts` and that row are seeded to agree; they are not wired together.

## Config

`backend/.env.example` — copy to `backend/.env`, which is gitignored and **loaded automatically at
startup** (via `python-dotenv`).

Generate a signing key before anyone else can reach the app:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into SECRET_KEY
```

The app starts with a built-in development key if you skip this, and prints a loud warning at startup
every time it does. Anyone who knows that key can forge a staff token.

| var | default |
|---|---|
| `DATABASE_URL` | `sqlite:///./bwell.db` — set `postgresql+psycopg2://user:pass@host:5432/bwell` for Postgres |
| `SECRET_KEY` | signs every login token — **set your own**, see below |
| `CORS_ORIGINS` | localhost:3000/3001 |

`frontend/.env.local` — `NEXT_PUBLIC_API_URL` (currently `http://127.0.0.1:8000`) and `NEXT_PUBLIC_ADMIN_KEY`.

## Staff accounts

The console is behind real logins, not a shared key. `Staff` holds a username, a bcrypt hash and a
role; sign in at `/admin/login`.

| role | may do |
|---|---|
| `OWNER` | everything, plus rates on **Rates & Services** and accounts on **Staff** |
| `STAFF` | patients, sessions, receipts, charges, export — the day to day |

- **Two audiences, two tokens.** Every JWT carries `typ` (`patient` or `staff`), so a patient token on
  `/admin/*` is a 403 and a staff token on `/patient/me` is too. The browser keeps them in separate
  localStorage keys and only sends the staff one to the console.
- **Deactivating signs someone out immediately** — `current_staff` re-checks `is_active` on every
  request, so a live token dies with the account. Their history stays.
- **The clinic can never be left without an owner:** demoting, deactivating or deleting the last active
  owner is a 422, and you cannot deactivate or delete yourself.
- **Receipts carry the taker's name** (`Payment.recorded_by`, and a *Taken By* column in the workbook).
  A patient's self-service sign-up records `Registration` rather than a person, because there isn't one.
- Staff tokens last 10 hours — a shift, not a fortnight.

**Bootstrap logins carry no password in this repo.** `seed.py` generates one strong password per
account per install and prints it once; nothing is stored in plaintext. To choose your own instead, set
`SEED_OWNER_PASSWORD` / `SEED_DESK_PASSWORD` in `backend/.env` before seeding. Usernames default to
`subrat` (OWNER) and `frontdesk` (STAFF) and are also overridable.

## Passwords

`[first 4 letters of name, CAPS] + [first 4 digits of phone]` — `JYOTIRREKHA` + `9348820192` → `JYOT9348`.
Derived at registration, stored bcrypt-hashed, returned in plaintext exactly once on the registration
confirmation screen. Names are uppercased and phone numbers stripped to 10 digits on the way in.

## Shared phone numbers and repeat patients

A household commonly shares one number, so `phone_number` is **indexed but not unique**. What must stay
unique is the derived login code: `RAJESH`→`RAJE9348` and `JYOTIRREKHA`→`JYOT9348` are different logins
on the same number, so login looks up every patient on the phone and lets the password pick the person.

Three cases the front desk hits, and what the app does:

| situation | what happens |
|---|---|
| **Family member on the same number** | Register normally. Admin → select a patient → *Register a family member on 93488…* opens `/register` with the number prefilled. The queue flags shared numbers, and searching the number lists everyone on it. |
| **Same person, new episode of care** | Admin → *New case*. Keeps the login and history, closes the running package, opens a fresh one (5/10/20 sessions) with blank session rows. Past packages stay readable via the tabs above the session table. |
| **First four letters of two names collide** on one number (`SUNITA` / `SUNIL` → both `SUNI`) | Registration is refused with a 409 naming the clash. Register the second person with a distinguishing initial (`R SUNIL` → `RSUN`) so the logins differ. |

Re-registering an identical name on the same number is refused too, pointing at *New case* instead —
that is nearly always what was meant.

Progress counters are scoped to the **running** package, so a returning patient restarts at 0/N rather
than inheriting last year's completed sessions.

On the **portal**, a patient sees their own courses of treatment under *Your checkups* (click one to
read its attendance log) and an *Also registered on …* card listing the other people on their number
with how many checkups each has had. That card carries names and session counts but **no diagnoses** —
`/patient/me` returns `household` without clinical fields; only the admin endpoint includes them.

## The clinic configures itself

Nothing the clinic charges for is hardcoded. `CatalogueItem` holds four kinds of row, all edited on
**Admin → Rates & Services** (`/admin/settings`):

| kind | what it is | where it shows up |
|---|---|---|
| `PACKAGE` | a fixed course — sessions, validity, fee | the cards on `/register`, and New Case |
| `PER_VISIT` | a daily-basis rate | same pickers, billed per visit instead of a fee |
| `ADDON` | an extra therapy and its price | the Billing drawer on any case |
| `THERAPIST` | a staff name | the Attended By box on the session table |

Change a price and the registration page shows the new one on the next load. Add a therapy and it is
billable immediately. Untick **Live** to retire something without touching cases already booked on it —
a package copies its name and price at booking time, so history never moves under you.

## Daily basis vs packages

`Package.per_visit_rate` decides which. When it is set the package fee is ignored and the case bills
**rate x visits attended**, so a walk-in owes nothing until they turn up. The card starts with one visit
and the front desk presses *Add today's visit* each time they come.

Everything else — sessions, notes, attendance, receipts — is identical, so there is one code path, not
two. A per-visit case never shows a "completed" badge; there is no fixed count to complete.

## What a case is billed

One rule, in `billed_for()`:

```
billed = (per_visit_rate x visits attended  OR  package price) + sum(charges)
```

`Charge` rows are the extras: an add-on therapy (positive) or a discount (negative, quantity-aware).
`Payment` rows are money in. `balance = billed - paid`, which is what the queue, the portal, the Today
board and the workbook all read. Instalments need no special support — they are just several receipts
against one case, and the first one can be taken at registration.

## Saving

Admin edits are **explicit**. Patient details, the package strip and the session table each hold their
changes locally, show `N unsaved changes`, and commit on **Save** — with **Discard** to throw them away.
Switching patient or case remounts the panel, so drafts never leak between people. Receipts, charges and
catalogue rows commit on their own button since each is a single discrete act.

## Today

The admin console opens on three panels the front desk actually works from: who is **in today** and
whether they have been marked off, who is **outstanding** (with the total owed and today's takings), and
which packages are **ending soon**. Every row opens that patient.

## Packages, prices and dates

Packages are not fixed subscriptions. Presets exist (5 / 10 / 20 sessions), but *New case → Custom /
pay-per-visit* lets the admin type the package name, session count, validity, price and both dates —
that is how a walk-in paying per visit gets booked. After creation, the strip above the session table
edits the name, price, start, end and payment mode in place; every field saves on change.

- `price` is whole rupees (`int`). No clinic here bills paise; switch to minor units if that changes.
- `end_date` defaults to `start_date + validity_days - 1` (day 1 counts) when the admin leaves it blank.
- Guards: `total_sessions` 1–100, `validity_days` 1–365, and `end_date` may not precede `start_date`.

## Receipts

`Package.price` is what was agreed; `Payment` rows are money actually taken. Keeping them apart is the
point — "billed" and "collected" are different questions, and the Summary sheet answers both.

The admin console's *Billing* strip on each package shows **Billed / Paid / Balance**, with a
*Receipts* drawer to record one (amount, date, mode, reference) or delete a mistyped one. The patient
queue flags an outstanding balance in amber, ahead of the package end date. The portal shows the same
three figures plus a one-line receipt history, so a patient can see what they still owe.

- **A refund is a negative receipt**, not a deleted one — the audit trail survives. Deletion is only for
  a receipt typed in error, and a zero amount is rejected outright.
- Receipts hang off a **package**, not a patient, so a returning patient's old case keeps its own money
  and the new one starts at zero.
- Overpayment is allowed and shows as a credit rather than being blocked; front desks take round sums.
- No payment gateway, no invoices, no tax — this records what the desk collected, nothing more.

| method | path |
|---|---|
| POST | `/api/v1/admin/packages/{package_id}/payments` |
| DELETE | `/api/v1/admin/payments/{payment_id}` |

## Who took the session

`AttendanceLog.attended_by` records the therapist or doctor. The admin table has an *Attended By* box
beside the protocol note, backed by a `<datalist>` of the clinic's regulars — free text, so a locum can
still be typed in. It shows in the patient's attendance log and in the roadmap day detail.

## Exporting to Excel

*Export* on the admin console downloads the patient register as a real `.xlsx` workbook (openpyxl). It
honours whatever is in the search box, so "export what I'm looking at" works; the button label shows the
row count.

Three sheets, built to be worked in rather than just opened:

- **Typed cells**, so Excel can sort and total them — dates are real dates (`dd-mmm-yyyy`), age, session
  counts and price are numbers (price shows as `₹ 6,000`), phone numbers are forced to text so Excel
  cannot reformat them.
- **Frozen header row** with an autofilter across every column on the two table sheets, and column widths
  set per field so addresses and diagnoses are readable without dragging.

**Sheet 1 — Summary**, the workbook opens here: patient counts by category, shared numbers, cases
running vs closed, sessions booked / completed / pending with a completion rate, revenue split into
billed vs collected with the outstanding balance and collection rate, and breakdowns by receipt mode and
by package. Every figure is computed from the same data as the other sheets, and there are tests
asserting they agree.

**Sheet 2 — Patients**, one row each: name, phone, alt phone, age, gender, email, address, referring
doctor, diagnosis, requirements, category, package, start date, end date, sessions done, total sessions,
status, price, payment mode, registered on. Reflects the *running* package.

**Sheet 3 — Sessions**, the clinic's day book: one row per booked session across *every* package, past
and present — name, phone, category, case, package, package started, day, session date, attended by,
protocol note, status. Pending sessions are included with blank dates, so it doubles as a schedule.

Rows are grouped per patient, then per case, then day 1..n, and stay in one uncut block. That needs the
`Case` column and the id tiebreakers in the sort: two patients can share a name, and one patient can
have two packages with the same default name and start date. Without them the rows interleave and the
sheet is unreadable — there is a test asserting the blocks stay whole.

**Sheet 4 — Payments**, one row per receipt: date, patient, phone, case, package, amount, mode,
reference, note. Oldest first. Under a date window this becomes the period's takings, since receipts are
windowed on `paid_on`.

**Date window.** The **Seen between** boxes under the search bar (`?from=` / `?to=`) are a search, not an
export setting: they narrow the console list *and* the workbook to the patients who actually attended in
that period. Either side may be left open. It asks for sessions that *happened*, so a case booked but not
yet attended does not put its patient in range; leave both blank for the whole register. Receipts are
windowed too, on the day the money arrived. The Summary's lifetime totals stay lifetime, so billing still
reads true — it gains "In window" and "Collected in window" lines instead. The filename carries the range
(`bwell-patients-2026-08-28_to_2026-08-30.xlsx`) so a folder of monthly exports sorts itself. A backwards
window is a 422, and the console will not send one.

For ad-hoc slicing you may not need it: every column on both sheets has an Excel autofilter, and because
the date cells are real dates, Excel offers its year/month/day filter tree on them directly.

## Searching the treatment history

The search box matches **UHID, name or phone**. The two date boxes beside it answer the other question a
clinic asks — *who did we actually see between these dates* — and they filter the list itself, not just
the export:

- A patient is in range if they have at least one **attended** session dated inside it. Booked-but-not-yet-attended
  cases do not count, because the question is who came in.
- Each row then shows **visits in that window** in place of the balance, so "who came three times last
  week" is one glance.
- With no window, the row shows **last seen** instead — the single most useful thing about a patient the
  front desk is looking at.
- **Last visit is always lifetime.** It does not shrink to fit the window, because a clinic looking at
  August still needs to know the patient was last here in June.
- The KPI row across the top stays the whole clinic. It is not a search result and must not move.

The Export button follows the same two filters, so the workbook is always the list you were looking at.

## Identifiers

Every patient gets a **UHID** (`BW-00001`) and every receipt a **serial** (`RCT-00001`), issued from
counters on the single `clinic` row. Two things follow from that:

- The counters only ever climb. Delete a mistyped receipt and its number is retired, never reissued —
  otherwise two patients could hold paper bearing the same serial.
- A clinic moving off a paper receipt book sets **Last receipt number issued** on the Settings screen and
  carries on from there. The field refuses to move backwards.

The UHID is what the console searches, what the queue shows, and what heads every printed document. A
name plus a household phone number identifies nobody here, which is the whole point.

## Printing

Everything the clinic hands over is a proper medical document on the clinic letterhead — printed from
the browser, so there is no PDF library and no server-side rendering to keep alive. One route
(`/print`) renders four documents:

| url | document | who |
|---|---|---|
| `/print?doc=receipt&patient=&package=&receipt=` | Payment receipt / refund voucher | staff |
| `/print?doc=bill&patient=&package=` | Bill of supply — itemised, with receipts and balance | staff |
| `/print?doc=record&patient=&package=` | Physiotherapy treatment record — session-wise, signed | staff |
| `/print?doc=daybook&from=&to=` | Collection & outstanding report | **owner only** |

Reached from the printer icons in the console: beside each receipt, on the case header (**Record**,
**Bill**), in the billing register, and from **Print collection report**. Documents are issued at the
counter — the portal has no print button, and every document reads the admin endpoint, so a patient
token gets nothing here.

Each document carries the clinic name, address, contact and **clinical establishment registration
number**; money documents add the bill-of-supply wording, clinical ones add the physiotherapist's
council registration. Fill these in at **Settings → Letterhead & document identity** before the first
real patient — a clinical document without them is not accepted for insurance or reimbursement.

Layout notes worth knowing: `@page` is A4, table headers repeat across page breaks, rows never split,
the console chrome is `.no-print`, and the whole thing is monochrome by design because clinics print on
cheap mono lasers.

### Prescription

`/print?doc=prescription&patient=<id>&package=<id>`, or the **Prescription** button beside Record
and Bill on a case.

This is the one document a patient may hand to somebody else — a referring doctor, an insurer,
another physiotherapist — so it differs from the treatment record in two ways.

It is **forward-looking**. The record says what was done; the prescription lists the sessions still
to come, with the phase and planned treatment for each from the clinic's own written protocol, and a
blank *Date given* column to tick off. When a course is finished it says so instead, and covers the
home programme and follow-up.

**Modalities, dosages and exercise repetitions print as ruled blank space, on purpose.** The record
holds a diagnosis, presenting complaints and the protocol, and those are printed. It does not hold
machine parameters or sets and repetitions, and software must not issue a clinical instruction no
clinician gave — so the physiotherapist writes those on the lines and signs beneath them.

Because it leaves the building, it is the only document that warns before printing: if the
letterhead carries no physiotherapist council registration number, an on-screen banner says so and
links to Settings. The warning does not print.

Every printed document carries the clinic's mark (`public/logo-mark.png`, cropped from the
signboard) twice: on the letterhead, and again enlarged and faded to 6% behind the body as a
watermark. Both are plain `<img>` elements rather than `next/image` — the optimised element can
still be loading when `window.print()` fires, and a letterhead that prints without its logo is worse
than one that never had it. In print the watermark switches to `position: fixed`, which makes Chrome
repeat it on every page of a two-page prescription; Firefox paints it on page one only.

The console and the patient portal carry the same mark at 3.5% behind the page, fixed so it holds
still while a long list scrolls over it. It is hidden in print.

**Who signs.** `physio_name` on the letterhead is whoever is actually seeing patients, not whoever is
on the signboard — `lib/clinic.ts` marks a physiotherapist `available: false` when they are not yet
taking patients, and that person is shown on the clinic card as *Not available yet* but is absent
from the booking picker, the physiotherapist cards and the session estimator. Keep the letterhead in
step with it: a prescription signed by someone who is not practising is worse than an unsigned one.

## Billing (owner only)

`/admin/billing`. The front desk takes payments; totals and the debtors ledger are the owner's, so the
route redirects a `STAFF` account back to the console and the endpoint returns 403 regardless.

- **Collections** are windowed — today, last 7 days, this month, last month, all time, or a custom range
  — and broken down by mode and by day.
- **Dues are never windowed.** A balance raised in March is still owed in June; showing it only inside
  its own month is how clinics lose track of money. The ledger includes closed cases: finishing the
  course does not clear the debt.
- **Ageing** buckets each debt from the day its case opened (0–30 / 31–60 / 61–90 / over 90).
- **Unpriced cases** are surfaced separately — a running case with neither a package fee nor a per-visit
  rate bills ₹0, which is somebody skipping a box, not a free course.

## API

| method | path | auth |
|---|---|---|
| POST | `/api/v1/auth/register` | — |
| POST | `/api/v1/auth/patient-login` | — |
| POST | `/api/v1/auth/staff-login` | — returns a staff JWT |
| GET | `/api/v1/staff/me` | staff JWT |
| GET/POST/PUT/DELETE | `/api/v1/admin/staff[/{id}]` | owner only |
| GET | `/api/v1/patient/me?package_id=` | patient JWT — own packages only |
| GET | `/api/v1/admin/patients?q=&from=&to=` | staff JWT — `q` matches UHID/name/phone; `from`/`to` search who attended |
| GET | `/api/v1/admin/patients/{id}?package_id=` | staff JWT |
| POST | `/api/v1/admin/patients/{id}/packages` | staff JWT — start a new case |
| PUT | `/api/v1/admin/patients/{patient_id}` | staff JWT — edit demographics and clinical fields |
| PUT | `/api/v1/admin/packages/{package_id}` | staff JWT — fix name, price, rate, dates, payment |
| POST | `/api/v1/admin/packages/{package_id}/sessions?count=` | staff JWT — append visits (daily basis) |
| POST | `/api/v1/admin/packages/{package_id}/charges` | staff JWT — add-on or discount |
| DELETE | `/api/v1/admin/charges/{charge_id}` | staff JWT |
| GET | `/api/v1/catalogue?kind=` | open — plans and prices for the registration page |
| POST/PUT/DELETE | `/api/v1/admin/catalogue[/{id}]` | **owner only** — the clinic's own rates |
| GET | `/api/v1/admin/today` | staff JWT — in today, outstanding, ending soon |
| POST | `/api/v1/admin/packages/{package_id}/payments` | staff JWT — record a receipt |
| DELETE | `/api/v1/admin/payments/{payment_id}` | staff JWT — undo a mistyped receipt |
| PUT | `/api/v1/admin/attendance/{session_id}` | staff JWT |
| GET | `/api/v1/admin/export.xlsx?q=&from=&to=` | staff JWT — Excel workbook, same filters as the list |
| GET | `/api/v1/clinic` | open — the letterhead, printed on documents patients pull themselves |
| PUT | `/api/v1/admin/clinic` | **owner only** — clinic identity, registration numbers, serial prefixes |
| GET | `/api/v1/admin/billing?from=&to=` | **owner only** — collections, receipts ledger, dues and ageing |

`/patient/me` returns `shared_number_count` only; the co-users' names are exposed on the admin detail
endpoint (`shared_number_with`) and never to the portal.

New **columns** are added to a live database on startup (`ensure_columns()` issues one `ALTER TABLE`
each and re-creates the model's indexes), so a clinic with a year of data never has to reseed to take an
upgrade. Anything larger than a nullable column — a rename, a type change, a constraint — still needs a
hand-written migration.

## Tests

```bash
cd backend && .venv/Scripts/python test_app.py     # prints "all checks passed"
```

Covers password derivation, uppercase/digit normalisation, wrong password, token-required and
admin-key-required paths, search, session updates and package completion — plus two patients on one
number logging into their own records, the login-code clash, the duplicate-registration hint, and a
second episode of care resetting progress while keeping the earlier package readable.

Also: the portal seeing its own package history and household without diagnoses, a patient being
refused someone else's `package_id` (404), `attended_by` round-tripping to the portal, a custom
pay-per-visit package with manual price and dates, the `end_date` default, the 422 guards on backwards
dates and absurd session counts, in-place package edits, and the xlsx export's two sheets — typed
date/number cells, number formats, frozen header, autofilter, search filter, per-case row blocks staying
contiguous and correctly numbered, the session day book covering every package rather than just the
running one, the date window (both sides, open-ended, empty result, filename, backwards range), and the
summary's totals agreeing with the sheets they summarise. Then the configurable half: catalogue CRUD and its validation, retiring an item without disturbing booked cases, add-ons and discounts moving the billed figure and the queue balance, a daily-basis case billing per visit attended and growing one visit at a time, the patient editor normalising input while leaving the login alone, and the Today board. Receipts get their own pass: part-payment
leaving a balance, a refund as a negative amount, deletion of a mistyped one, receipts staying with
their own package across a new case, the balance reaching the queue and the portal, and the workbook's
Payments sheet reconciling with the Summary's collected figure.

Then the billing half: the letterhead's owner-only gate and its validation, UHIDs being unique and
searchable, a deleted receipt's serial never being reissued, receipt numbering refusing to wind
backwards, and the billing report — every breakdown adding back up to the headline it sits under, dues
aged oldest-first, unpriced cases surfaced, and a window narrowing the takings while leaving the dues
alone. Date search gets its own pass: the window narrowing the list, visit counts confined to the window
while last-visit stays lifetime, the KPI row refusing to move with the search, text search applying on top
of the window, an empty window returning nobody rather than everybody, and the workbook agreeing with the
list. Finally the upgrade path itself: a column is dropped out of the live database and startup is made
to put it, and its index, back.

## Registration

**Staff only.** `POST /api/v1/auth/register` requires a signed-in member of staff, and `/register`
bounces anyone without a staff token to the console sign-in. Registration writes a patient, a
package and its charges into the live register — that is a counter activity, not something the
internet gets to do. The public site raises an [inquiry](#inquiries-from-the-public-site) instead,
and neither the landing page, the footer nor the patient login offers a route into registration any
more.

Registration takes a phone number, not a one-time code. There is **no OTP step**: the front desk
registers the patient standing in front of them, and a code round-trip only adds a way for that to
fail at the counter. The earlier build carried a demo OTP screen that generated the code in the
browser and printed it on the same screen — that proved the flow, not the phone number, and has been
removed rather than left to look like a security control.

The phone number is still the login ID, and a shared household number still distinguishes people by
the derived password, so nothing about identification depends on the number being reachable.

### Diagnosis categories

Categories are **not** a fixed A/B/C any more — they are catalogue rows of kind `CATEGORY`, edited on
**Admin → Rates & Services → Diagnosis categories** alongside packages and therapies. Each row has a
name and a short `code`.

The code, not the name, is what lands on `Patient.category`, so the clinic can rename
"Cartilage & Degenerative" without rewriting a single patient row — but changing a code orphans the
patients already filed under it, which is why the two are separate fields. Retired categories stay
readable: their chips keep their label so an old patient never shows a bare letter.

The backend validates the *shape* of a code (1-2 letters or digits) rather than its membership: the
list lives in the database and a Pydantic validator has no session. The registration picker only ever
offers configured categories, and the endpoint is staff-only, so shape is the guard that earns its
keep. `GET /admin/patients` returns `stats.by_category` — counted from what the register actually
holds — instead of three hard-coded keys, and the console renders one KPI card per category with
anything under a deleted code swept up at the end.

## Known shortcuts

Marked with `ponytail:` comments in the code.

- **The billing report reads every package and log, then filters in memory** (`backend/main.py`).
  Fine at clinic scale; push the window into SQL if the register ever runs to five figures.
