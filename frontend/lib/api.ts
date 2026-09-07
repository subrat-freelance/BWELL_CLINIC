import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`,
});

/**
 * Two separate logins, two separate tokens. The staff one is only ever sent to the
 * console; a patient token on /admin is rejected by the server anyway.
 */
const STAFF_TOKEN = "bwell_staff_token";
const STAFF_WHO = "bwell_staff";
const PATIENT_TOKEN = "bwell_token";

api.interceptors.request.use((config) => {
  if (typeof window === "undefined") return config;
  // /auth/register sits outside the /admin prefix but is a counter activity, so it is
  // named here — without it the front desk's registration goes out unauthenticated.
  // These three cover every authenticated staff route; nothing else needs a fallback,
  // and a fallback would cross the two tokens the comment above promises to keep apart.
  const staffSide =
    config.url?.startsWith("/admin") ||
    config.url?.startsWith("/staff") ||
    config.url?.startsWith("/auth/register");
  const token = localStorage.getItem(staffSide ? STAFF_TOKEN : PATIENT_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type Staff = {
  id: string;
  username: string;
  full_name: string;
  role: "OWNER" | "STAFF";
  phone: string | null;
  can_change_password: boolean;
  is_active: boolean;
  last_login_at: string | null;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target: string;
  summary: string;
};

export function saveStaffToken(token: string, who: Staff) {
  localStorage.setItem(STAFF_TOKEN, token);
  localStorage.setItem(STAFF_WHO, JSON.stringify(who));
}

/**
 * Call this from an effect or an event handler, never during render — it reads
 * localStorage, which is empty on the server, so a render-time call makes the
 * first client render differ from the server's and hydration fails.
 */
export function currentStaff(): Staff | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(STAFF_WHO) ?? "null");
  } catch {
    return null;
  }
}

export function signOutStaff() {
  localStorage.removeItem(STAFF_TOKEN);
  localStorage.removeItem(STAFF_WHO);
}

/** True for 401/403 — the console should bounce to the sign-in screen. */
export function isAuthError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

/** FastAPI returns {detail: string | [{msg}]} - flatten it for toast/inline display. */
export function apiError(err: unknown, fallback = "Something went wrong"): string {
  const body = (err as { response?: { data?: unknown } })?.response?.data;
  // A failed file download carries its error as a Blob, which has no `detail` to read.
  if (typeof Blob !== "undefined" && body instanceof Blob) return fallback;
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg ?? "").join(", ") || fallback;
  return fallback;
}

export type Patient = {
  id: string;
  /** Hospital number. Printed on every document and on the patient's card. */
  uhid: string | null;
  phone_number: string;
  full_name: string;
  age: number;
  gender: string;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  referring_doctor: string | null;
  diagnosis: string | null;
  requirements: string | null;
  /** A code from the CATEGORY catalogue. Not a fixed set — the clinic defines it. */
  category: string;
  created_at: string;
};

export type Package = {
  id: string;
  package_name: string;
  validity_days: number;
  total_sessions: number;
  payment_mode: string;
  price: number;
  per_visit_rate: number;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  /** Present on the `packages` history list, not on the single active `package`. */
  completed_sessions?: number;
  billed?: number;
  paid?: number;
  balance?: number;
};

export type ChargeRow = {
  id: string;
  package_id: string;
  description: string;
  amount: number;
  quantity: number;
  charged_on: string;
};

export type PaymentRow = {
  id: string;
  receipt_no: string | null;
  package_id: string;
  amount: number;
  paid_on: string;
  mode: string;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
};

export type SessionLog = {
  id: string;
  session_day: number;
  session_date: string | null;
  protocol_note: string | null;
  attended_by: string | null;
  is_verified: boolean;
};

export type HouseholdMember = {
  id: string;
  full_name: string;
  category: string;
  cases: number;
  package_name: string | null;
  completed_sessions: number;
  total_sessions: number;
  /** Admin console only — never sent to the patient portal. */
  diagnosis?: string | null;
};

export type PatientPayload = {
  patient: Patient;
  package: Package | null;
  packages: Package[];
  sessions: SessionLog[];
  completed_sessions: number;
  is_package_completed: boolean;
  payments: PaymentRow[];
  charges: ChargeRow[];
  billed: number;
  paid: number;
  balance: number;
  shared_number_count: number;
  household: HouseholdMember[];
  /** Admin detail only - same rows plus each person's diagnosis. */
  shared_number_with?: HouseholdMember[];
};

export type PatientRow = Patient & {
  completed_sessions: number;
  total_sessions: number;
  package_name: string | null;
  end_date: string | null;
  balance: number;
  shares_number: boolean;
  /** Lifetime, so it still reads true while a date window is applied. */
  last_visit: string | null;
  /** Attended sessions inside the current date window, or lifetime when there is none. */
  visits: number;
};

/**
 * Diagnosis categories are catalogue rows, so their chips are built from the data
 * rather than a fixed A/B/C map. Tones cycle by position — six before a repeat, which
 * is well past the number of categories a physiotherapy clinic actually runs.
 */
const CATEGORY_TONES = [
  { chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  { chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  { chip: "bg-brand/10 text-brand ring-brand/25", dot: "bg-brand" },
];

const UNKNOWN_TONE = { chip: "bg-slate-100 text-slate-600 ring-slate-300", dot: "bg-slate-400" };

export type CategoryLook = { label: string; short: string; chip: string; dot: string };

/**
 * Retired categories are included on purpose: a patient filed under one still has to
 * render, and hiding the label would leave a bare code on their chip.
 */
export function useCategories() {
  const all = useCatalogue("CATEGORY", true);
  const rows = all.data ?? [];
  const look: Record<string, CategoryLook> = {};
  rows.forEach((c, i) => {
    look[c.code] = {
      label: `${c.code} · ${c.name}`,
      short: c.name,
      ...CATEGORY_TONES[i % CATEGORY_TONES.length],
    };
  });
  return {
    ...all,
    /** What a new patient may be filed under. */
    active: rows.filter((c) => c.is_active),
    /** Every code ever configured, retired ones included. */
    look,
    /** Safe for a code with no catalogue row behind it — a hand-set value, or one deleted. */
    of: (code: string | null | undefined): CategoryLook =>
      (code && look[code]) || { label: code || "Uncategorised", short: code || "—", ...UNKNOWN_TONE },
  };
}
/** Payment rails are a fixed enum, not clinic configuration — this one stays a constant. */
export const PAY_MODES = ["CASH", "UPI", "CARD", "INSURANCE"];

export type CatalogueKind = "PACKAGE" | "PER_VISIT" | "ADDON" | "THERAPIST" | "CATEGORY";

export type CatalogueItem = {
  id: string;
  kind: CatalogueKind;
  name: string;
  /** CATEGORY rows only — the short code stored on Patient.category. Blank elsewhere. */
  code: string;
  price: number;
  total_sessions: number;
  validity_days: number;
  is_active: boolean;
  sort_order: number;
};

/** Both forms spelled out — "therapy" does not pluralise by adding an s. */
export const KIND_LABEL: Record<CatalogueKind, { one: string; many: string }> = {
  PACKAGE: { one: "Package", many: "Packages" },
  PER_VISIT: { one: "Per-visit rate", many: "Per-visit rates" },
  // `one` is what follows "Add"/"New", so it stays short; `many` labels the tab.
  ADDON: { one: "Therapy", many: "Add-on therapies" },
  THERAPIST: { one: "Therapist", many: "Therapists" },
  CATEGORY: { one: "Category", many: "Diagnosis categories" },
};

/**
 * Plans, rates, therapies and staff come from the database so the clinic can change
 * them on the Settings screen. Nothing here is hardcoded any more.
 */
export function useCatalogue(kind?: CatalogueKind, includeInactive = false) {
  return useQuery({
    queryKey: ["catalogue", kind ?? "all", includeInactive],
    queryFn: async () =>
      (
        await api.get<CatalogueItem[]>("/catalogue", {
          params: { kind, include_inactive: includeInactive || undefined },
        })
      ).data,
    staleTime: 30_000,
  });
}

export type Clinic = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  registration_no: string;
  gstin: string;
  physio_name: string;
  physio_qualification: string;
  physio_reg_no: string;
  footer_note: string;
  uhid_prefix: string;
  receipt_prefix: string;
  uhid_seq: number;
  receipt_seq: number;
};

/** The letterhead. Open endpoint - it heads documents patients print for themselves. */
export function useClinic() {
  return useQuery({
    queryKey: ["clinic"],
    queryFn: async () => (await api.get<Clinic>("/clinic")).data,
    staleTime: 5 * 60_000,
  });
}

/** Someone who asked to be seen from the public site. Not a patient yet. */
export type Inquiry = {
  id: string;
  full_name: string;
  phone_number: string;
  reason: string | null;
  preferred_physio: string | null;
  preferred_date: string | null;
  preferred_slot: string | null;
  symptoms: string | null;
  status: InquiryStatus;
  note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
};

export const INQUIRY_STATUS = ["NEW", "CONTACTED", "BOOKED", "CLOSED"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUS)[number];

export const INQUIRY_LABEL: Record<InquiryStatus, { text: string; chip: string }> = {
  NEW: { text: "Not called yet", chip: "border-amber-300 bg-amber-50 text-amber-800" },
  CONTACTED: { text: "Called back", chip: "border-sky-300 bg-sky-50 text-sky-800" },
  BOOKED: { text: "Came in", chip: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  CLOSED: { text: "Closed", chip: "border-slate-300 bg-slate-100 text-slate-600" },
};

export type InquiryBoard = {
  inquiries: Inquiry[];
  counts: Record<InquiryStatus, number>;
};

/**
 * The front desk's callback list — staff-wide, not owner-only, because ringing
 * people back is the desk's job. Polled so the badge is right on a screen that
 * sits open all day.
 */
export function useInquiries(status?: InquiryStatus) {
  return useQuery({
    queryKey: ["inquiries", status ?? "all"],
    queryFn: async () =>
      (await api.get<InquiryBoard>("/admin/inquiries", { params: { status } })).data,
    refetchInterval: 60_000,
  });
}

export type LedgerRow = {
  id: string;
  receipt_no: string | null;
  paid_on: string;
  amount: number;
  mode: string;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  patient_id: string;
  uhid: string | null;
  full_name: string;
  phone_number: string;
  package_id: string;
  package_name: string;
  case_no: number;
};

export type DueRow = {
  patient_id: string;
  uhid: string | null;
  full_name: string;
  phone_number: string;
  package_id: string;
  package_name: string;
  case_no: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  billed: number;
  paid: number;
  balance: number;
  days: number;
  bucket: string;
  last_paid_on: string | null;
};

export type BillingReport = {
  from: string | null;
  to: string | null;
  generated_at: string;
  totals: {
    collected: number;
    receipts: number;
    refunded: number;
    collected_today: number;
    billed_lifetime: number;
    collected_lifetime: number;
    outstanding: number;
  };
  by_mode: { mode: string; receipts: number; amount: number }[];
  by_day: { date: string; receipts: number; amount: number }[];
  ledger: LedgerRow[];
  ageing: { bucket: string; cases: number; amount: number }[];
  outstanding: DueRow[];
  unbilled: { patient_id: string; uhid: string | null; full_name: string; package_id: string; package_name: string; case_no: number; start_date: string; sessions: number }[];
};

export const rupees = (n: number | null | undefined) =>
  n == null ? "—" : `₹ ${n.toLocaleString("en-IN")}`;

export const shortDate = (d: string | null | undefined) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      })
    : "—";

/** Spelled out for the "in words" line every Indian receipt carries. */
const ONES =
  "ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN SIXTEEN SEVENTEEN EIGHTEEN NINETEEN".split(
    " ",
  );
const TENS = "  TWENTY THIRTY FORTY FIFTY SIXTY SEVENTY EIGHTY NINETY".split(" ");

const words = (n: number): string =>
  n < 20
    ? ONES[n]
    : n < 100
      ? `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`
      : `${ONES[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` ${words(n % 100)}` : ""}`;

/** Indian grouping - crore, lakh, thousand - as a rupee receipt is written here. */
export function amountInWords(value: number): string {
  const n = Math.abs(Math.round(value));
  if (n === 0) return "RUPEES ZERO ONLY";
  const said = ([
    [Math.floor(n / 1e7), "CRORE"],
    [Math.floor((n % 1e7) / 1e5), "LAKH"],
    [Math.floor((n % 1e5) / 1e3), "THOUSAND"],
    [n % 1000, ""],
  ] as [number, string][])
    .filter(([count]) => count > 0)
    .map(([count, unit]) => (unit ? `${words(count)} ${unit}` : words(count)))
    .join(" ");
  return `RUPEES ${value < 0 ? "MINUS " : ""}${said} ONLY`;
}

/** Documents get the date written out; a grid gets the short form. */
/**
 * The API records UTC, but SQLite drops the offset, so timestamps arrive naive
 * ("2026-09-04T08:47:39"). `new Date()` reads those as *local* time, which puts every
 * "x minutes ago" out by the viewer's offset — in IST a row created a minute ago reads
 * as six hours old. Pin a naive stamp to UTC; leave one that already carries an offset.
 */
export const utcStamp = (iso: string) =>
  new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);

export const longDate = (d: string | null | undefined) =>
  d
    ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

/** Admin workbook download. Goes through axios so the x-admin-key header is attached. */
export async function downloadPatientsXlsx(q: string, from = "", to = "") {
  const { data } = await api.get("/admin/export.xlsx", {
    params: { q, from: from || undefined, to: to || undefined },
    responseType: "blob",
  });
  const span = from || to ? `${from || "start"}_to_${to || "today"}` : new Date().toISOString().slice(0, 10);
  saveBlob(data as Blob, `bwell-patients-${span}.xlsx`);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Firefox ignores .click() on an anchor that is not in the document, so put it
  // there first — otherwise the export silently does nothing on that browser.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download that has only just started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The 10-day cartilage/rehab roadmap the clinic runs every package against. */
export const ROADMAP = [
  { day: 1, phase: "Acute Care", goal: "Assessment, pain modulation, IFT" },
  { day: 2, phase: "Acute Care", goal: "Swelling control, gentle passive ROM" },
  { day: 3, phase: "Mobility", goal: "Ultrasound therapy, isometric holds" },
  { day: 4, phase: "Mobility", goal: "Manual therapy, joint mobilisation" },
  { day: 5, phase: "Strength", goal: "Closed-chain quads / glute activation" },
  { day: 6, phase: "Strength", goal: "Progressive resistance, wall squats" },
  { day: 7, phase: "Load Tolerance", goal: "Proprioception board, gait re-ed" },
  { day: 8, phase: "Load Tolerance", goal: "Step-ups, controlled cartilage loading" },
  { day: 9, phase: "Function", goal: "Endurance, stair climbing, ADL drills" },
  { day: 10, phase: "Function", goal: "Reassessment + home exercise programme" },
];

/** Packages can run 5, 10 or 20 sessions — cycle the plan past day 10. */
export const roadmapFor = (day: number) => ROADMAP[(day - 1) % ROADMAP.length];

export const PHASE_COLOR: Record<string, string> = {
  "Acute Care": "text-rose-600 bg-rose-50 ring-rose-200",
  Mobility: "text-amber-600 bg-amber-50 ring-amber-200",
  Strength: "text-sky-600 bg-sky-50 ring-sky-200",
  "Load Tolerance": "text-violet-600 bg-violet-50 ring-violet-200",
  Function: "text-emerald-600 bg-emerald-50 ring-emerald-200",
};
