"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  Download,
  Inbox,
  IndianRupee,
  Layers,
  Loader2,
  Search,
  LogOut,
  Settings,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
  X,
  ScrollText,
  KeyRound,
} from "lucide-react";
import Link from "next/link";
import ClinicMark, { ClinicWatermark } from "@/lib/ClinicMark";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PatientPanel from "./PatientPanel";
import {
  api,
  apiError,
  useCategories,
  downloadPatientsXlsx,
  PAY_MODES,
  rupees,
  shortDate,
  currentStaff,
  isAuthError,
  signOutStaff,
  useCatalogue,
  useInquiries,
  type CatalogueItem,
  type Staff,
  type PatientPayload,
  type PatientRow,
} from "@/lib/api";
import NumberField from "@/lib/NumberField";

type AdminList = {
  stats: { total: number; by_category: Record<string, number>; shared_numbers: number };
  patients: PatientRow[];
};

type BoardRow = {
  patient_id: string;
  full_name: string;
  phone_number: string;
  package_name: string;
  end_date: string | null;
  completed_sessions: number;
  total_sessions: number;
  balance: number;
  session_day?: number;
  is_verified?: boolean;
};

type Board = {
  date: string;
  scheduled_today: BoardRow[];
  expiring_soon: BoardRow[];
  outstanding: BoardRow[];
  collected_today: number;
};

export default function AdminPage() {
  const qc = useQueryClient();
  const router = useRouter();
  // Starts null on purpose: reading localStorage in the initialiser runs on the
  // server too, where it is empty, so the first client render would differ and
  // hydration would fail. The effect below fills it in after mount.
  const [me, setMe] = useState<Staff | null>(null);

  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Typing a date can momentarily invert the range. Asking the server for it just
  // returns 422 and the screen goes stale with no explanation, so do not ask.
  const badRange = !!(from && to && to < from);

  const list = useQuery({
    queryKey: ["admin-patients", q, from, to],
    queryFn: async () =>
      (
        await api.get<AdminList>("/admin/patients", {
          params: { q, from: from || undefined, to: to || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
    enabled: !badRange,
  });

  const board = useQuery({
    queryKey: ["admin-today"],
    queryFn: async () => (await api.get<Board>("/admin/today")).data,
  });

  useEffect(() => {
    if (!localStorage.getItem("bwell_staff_token")) return void router.replace("/admin/login");
    setMe(currentStaff());
    // ?open=<patient id> is how the billing screen hands a case back here. Read from
    // location, not useSearchParams, so this page still needs no Suspense boundary.
    const open = new URLSearchParams(window.location.search).get("open");
    if (open) setSelectedId(open);
  }, [router]);

  useEffect(() => {
    if (isAuthError(list.error) || isAuthError(board.error)) {
      signOutStaff();
      router.replace("/admin/login");
    }
  }, [list.error, board.error, router]);

  const activeId = selectedId ?? list.data?.patients[0]?.id ?? null;

  const detail = useQuery({
    queryKey: ["admin-patient", activeId, packageId],
    queryFn: async () =>
      (
        await api.get<PatientPayload>(`/admin/patients/${activeId}`, {
          params: { package_id: packageId },
        })
      ).data,
    enabled: !!activeId,
  });

  const selectPatient = (id: string) => {
    setSelectedId(id);
    setPackageId(null);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-patient"] });
    qc.invalidateQueries({ queryKey: ["admin-patients"] });
    qc.invalidateQueries({ queryKey: ["admin-today"] });
  };

  const stats = list.data?.stats;
  // How many people asked to be seen and have not been rung back yet.
  const waitingOnCall = useInquiries().data?.counts.NEW ?? 0;
  const categories = useCategories();

  // One card per category the clinic actually uses, in the order Settings lists them,
  // with anything filed under a since-deleted code swept up at the end rather than lost.
  const counted = stats?.by_category ?? {};
  const known = categories.active.map((c) => c.code);
  const orphans = Object.keys(counted).filter((code) => !known.includes(code));
  const kpis = [
    { label: "Total active patients", value: stats?.total, icon: Users, tone: "text-brand bg-brand/10" },
    ...[...known, ...orphans].map((code) => ({
      label: categories.of(code).label,
      value: counted[code] ?? 0,
      icon: Layers,
      tone: categories.of(code).chip.replace(/ring-[\w/-]+/, ""),
    })),
  ];

  return (
    <main className="min-h-screen">
      <ClinicWatermark />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <ClinicMark size={38} />
            <span className="text-sm font-bold tracking-tight">B-WELL · CLINIC ADMIN</span>
          </Link>
          <span className="flex items-center gap-3">
            {/* Everyone at the desk sees this — ringing people back is their job,
                not the owner's, so it sits outside the owner-only block below. */}
            <Link href="/admin/inquiries" className="btn-ghost relative py-2 text-xs">
              <Inbox size={14} /> Inquiries
              {waitingOnCall > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white"
                  aria-label={`${waitingOnCall} not called back yet`}
                >
                  {waitingOnCall}
                </span>
              )}
            </Link>
            {me && (
              <span className="hidden text-xs text-slate-500 sm:block">
                {me.full_name}
                <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                  {me.role}
                </span>
              </span>
            )}
            {me?.role === "OWNER" && (
              <>
                <Link href="/admin/billing" className="btn-ghost py-2 text-xs">
                  <Wallet size={14} /> Billing
                </Link>
                <Link href="/admin/settings" className="btn-ghost py-2 text-xs">
                  <Settings size={14} /> Rates &amp; Services
                </Link>
                <Link href="/admin/audit" className="btn-ghost py-2 text-xs">
                  <ScrollText size={14} /> Activity
                </Link>
              </>
            )}
            {(me?.role === "OWNER" || me?.can_change_password) && (
              <Link href="/admin/account" className="btn-ghost py-2 text-xs">
                <KeyRound size={14} /> Password
              </Link>
            )}
            <button
              className="btn-ghost py-2 text-xs"
              onClick={() => {
                signOutStaff();
                router.replace("/admin/login");
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="card flex items-center gap-4 p-5">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
                <Icon size={20} />
              </span>
              <div>
                <p className="text-2xl font-bold tabular-nums">{value ?? "—"}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {board.data && <TodayBoard board={board.data} onOpen={selectPatient} />}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search size={17} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              className="input py-3 pl-10"
              placeholder="Search by UHID, phone number or patient name…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSelectedId(null);
                setPackageId(null);
              }}
            />
          </div>
          <button
            className="btn-ghost py-3"
            disabled={exporting || badRange}
            title="Downloads the list below as an Excel workbook (.xlsx)"
            onClick={async () => {
              setExporting(true);
              setExportError("");
              try {
                await downloadPatientsXlsx(q, from, to);
              } catch (err) {
                // Without this the button just went quiet: no file, no message, and a
                // shift that had been open past the token's ten hours looked broken.
                if (isAuthError(err)) {
                  signOutStaff();
                  router.replace("/admin/login");
                } else {
                  setExportError(apiError(err, "The workbook could not be generated."));
                }
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export {q || from || to ? "results" : "all"} ({list.data?.patients.length ?? 0})
          </button>
          <Link href="/register" className="btn-ghost py-3">
            <UserPlus size={15} /> New patient
          </Link>
        </div>

        {exportError && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
            {exportError}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <CalendarRange size={14} className="text-slate-400" />
          <span className="font-semibold">Seen between:</span>
          <input
            type="date"
            className="input w-auto px-2 py-1 text-xs"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Seen from"
          />
          <span>to</span>
          <input
            type="date"
            className="input w-auto px-2 py-1 text-xs"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Seen to"
          />
          {badRange && (
            <span className="font-semibold text-rose-600">
              — the end date is before the start date
            </span>
          )}
          {from || to ? (
            <>
              <button
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="font-semibold text-brand-deep hover:underline"
              >
                clear
              </button>
              <span className="text-slate-400">
                — showing patients who attended in this window; the export matches
              </span>
            </>
          ) : (
            <span className="text-slate-400">— pick dates to search the treatment history</span>
          )}
        </div>
        {!!stats?.shared_numbers && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Users size={13} className="text-amber-600" />
            {stats.shared_numbers} phone number{stats.shared_numbers > 1 ? "s are" : " is"} shared by more
            than one patient — search the number to see everyone on it.
          </p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="card flex max-h-[80vh] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-bold">Patient Queue</h2>
              <span className="text-xs font-semibold text-slate-400">
                {list.data?.patients.length ?? 0}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {list.isPending && <p className="p-5 text-sm text-slate-400">Loading…</p>}
              {list.data?.patients.length === 0 && (
                <p className="p-5 text-sm text-slate-400">
                  {q && (from || to)
                    ? `Nobody matching “${q}” attended between those dates.`
                    : from || to
                      ? "Nobody attended between those dates."
                      : `No patient matches “${q}”.`}
                </p>
              )}
              {list.data?.patients.map((p) => {
                const cat = categories.of(p.category);
                return (
                  <button
                    key={p.id}
                    onClick={() => selectPatient(p.id)}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3 text-left transition
                      ${p.id === activeId ? "bg-brand/5/70" : "hover:bg-slate-50"}`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${cat.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold uppercase">{p.full_name}</span>
                      <span className="flex items-center gap-1 font-mono text-xs text-slate-400">
                        {p.uhid ?? p.phone_number}
                        {p.shares_number && (
                          <Users size={11} className="text-amber-600" aria-label="shared number" />
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold tabular-nums text-slate-500">
                        {p.completed_sessions}/{p.total_sessions || "—"}
                      </span>
                      {from || to ? (
                        <span className="block text-[10px] font-semibold text-brand-deep">
                          {p.visits} visit{p.visits === 1 ? "" : "s"}
                        </span>
                      ) : p.balance > 0 ? (
                        <span className="block text-[10px] font-semibold text-amber-700">
                          {rupees(p.balance)} due
                        </span>
                      ) : (
                        <span className="block text-[10px] text-slate-400">
                          {p.last_visit ? `last seen ${shortDate(p.last_visit)}` : "no visit yet"}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="card overflow-hidden">
            {!detail.data ? (
              <div className="flex h-64 items-center justify-center text-slate-400">
                {detail.isFetching ? <Loader2 className="animate-spin" /> : "Select a patient"}
              </div>
            ) : (
              <>
                <div className="border-b border-slate-200 px-6 pt-5">
                  <h2 className="text-lg font-bold uppercase">{detail.data.patient.full_name}</h2>
                  <p className="font-mono text-xs text-slate-400">
                    UHID {detail.data.patient.uhid ?? "—"} · {detail.data.patient.phone_number}
                  </p>
                </div>
                <PatientPanel
                  key={`${activeId}-${detail.data.package?.id ?? "none"}`}
                  data={detail.data}
                  onSelectPatient={selectPatient}
                  onPickPackage={setPackageId}
                  onNewCase={() => setNewCaseOpen(true)}
                  onChanged={refresh}
                />
              </>
            )}
          </section>
        </div>
      </div>

      {newCaseOpen && detail.data && (
        <NewCaseModal
          patient={detail.data.patient}
          onClose={() => setNewCaseOpen(false)}
          onDone={() => {
            setNewCaseOpen(false);
            setPackageId(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------- today */
function TodayBoard({ board, onOpen }: { board: Board; onOpen: (id: string) => void }) {
  const owed = board.outstanding.reduce((sum, r) => sum + r.balance, 0);
  const panels = [
    {
      title: `In today (${board.scheduled_today.length})`,
      empty: "Nobody booked for today.",
      rows: board.scheduled_today,
      right: (r: BoardRow) =>
        r.is_verified ? (
          <span className="text-[10px] font-semibold text-brand">done</span>
        ) : (
          <span className="text-[10px] font-semibold text-amber-700">due</span>
        ),
    },
    {
      title: `Outstanding (${board.outstanding.length})`,
      empty: "Everyone is settled.",
      rows: board.outstanding.slice(0, 6),
      right: (r: BoardRow) => (
        <span className="text-[10px] font-semibold text-amber-700">{rupees(r.balance)}</span>
      ),
    },
    {
      title: `Ending soon (${board.expiring_soon.length})`,
      empty: "Nothing expiring this week.",
      rows: board.expiring_soon.slice(0, 6),
      right: (r: BoardRow) => (
        <span className="text-[10px] text-slate-400">{shortDate(r.end_date)}</span>
      ),
    },
  ];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      {panels.map((panel) => (
        <div key={panel.title} className="card flex flex-col p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            {panel.title.startsWith("Outstanding") ? (
              <IndianRupee size={13} className="text-amber-600" />
            ) : panel.title.startsWith("Ending") ? (
              <TriangleAlert size={13} className="text-rose-500" />
            ) : (
              <Users size={13} className="text-brand" />
            )}
            {panel.title}
          </p>
          {panel.rows.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">{panel.empty}</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {panel.rows.map((r, i) => (
                <li key={`${r.patient_id}-${i}`}>
                  <button
                    onClick={() => onOpen(r.patient_id)}
                    className="flex w-full items-center gap-2 py-1.5 text-left hover:text-brand-deep"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase">
                      {r.full_name}
                    </span>
                    {panel.right(r)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {panel.title.startsWith("Outstanding") && owed > 0 && (
            <p className="mt-auto pt-2 text-[11px] font-semibold text-slate-500">
              {rupees(owed)} owed in total · {rupees(board.collected_today)} collected today
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- new case */
function NewCaseModal({
  patient,
  onClose,
  onDone,
}: {
  patient: PatientPayload["patient"];
  onClose: () => void;
  onDone: () => void;
}) {
  const categories = useCategories();
  const plans = useCatalogue();
  const bookable = (plans.data ?? []).filter((p) => p.kind === "PACKAGE" || p.kind === "PER_VISIT");

  const [picked, setPicked] = useState<CatalogueItem | null>(null);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState(1);
  const [validity, setValidity] = useState(30);
  const [price, setPrice] = useState(0);
  const [perVisit, setPerVisit] = useState(0);
  const [payment, setPayment] = useState("CASH");
  const [advance, setAdvance] = useState(0);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [diagnosis, setDiagnosis] = useState(patient.diagnosis ?? "");
  const [category, setCategory] = useState(patient.category);
  const [error, setError] = useState("");

  const choose = (p: CatalogueItem) => {
    setPicked(p);
    setCustom(false);
    setName(p.name);
    if (p.kind === "PER_VISIT") {
      setPerVisit(p.price);
      setPrice(0);
      setSessions(1);
      setValidity(p.validity_days || 30);
      setAdvance(0);
    } else {
      setPerVisit(0);
      setPrice(p.price);
      setSessions(p.total_sessions);
      setValidity(p.validity_days);
      setAdvance(p.price);
    }
  };

  const start = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/admin/patients/${patient.id}/packages`, {
          package_name: name,
          total_sessions: sessions,
          validity_days: validity,
          price,
          per_visit_rate: perVisit,
          payment_mode: payment,
          advance_amount: advance,
          start_date: startDate || null,
          end_date: endDate || null,
          diagnosis,
          category,
        })
      ).data,
    onSuccess: onDone,
    onError: (err) => setError(apiError(err, "Could not start the new case")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-7">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold">New case for {patient.full_name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Same login ({patient.phone_number}) — the running case is closed and a fresh one opens.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5">
          <label className="label">Plan</label>
          <div className="grid gap-2">
            {bookable.map((p) => (
              <button
                key={p.id}
                onClick={() => choose(p)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition
                  ${!custom && picked?.id === p.id ? "border-brand bg-brand/5/60" : "border-slate-200 hover:border-slate-300"}`}
              >
                <span>
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-slate-500">
                    {p.kind === "PER_VISIT"
                      ? `Daily basis · valid ${p.validity_days} days`
                      : `${p.total_sessions} sessions · valid ${p.validity_days} days`}
                  </span>
                </span>
                <span className="text-sm font-semibold text-brand-deep">
                  {rupees(p.price)}
                  {p.kind === "PER_VISIT" && <span className="text-slate-400"> /visit</span>}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                setCustom(true);
                setPicked(null);
                setName("One-off treatment");
              }}
              className={`rounded-xl border px-4 py-3 text-left transition
                ${custom ? "border-brand bg-brand/5/60" : "border-slate-200 hover:border-slate-300"}`}
            >
              <span className="block text-sm font-semibold">Something else</span>
              <span className="text-xs text-slate-500">Type the name, sessions and price yourself</span>
            </button>
          </div>
          {bookable.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              No plans configured yet — add them under Rates &amp; Services.
            </p>
          )}
        </div>

        {(custom || picked) && (
          <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Name on the card</span>
              <input className="input bg-white" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <span className="label">Sessions</span>
              <NumberField
                className="input bg-white"
                min={1}
                max={100}
                value={sessions}
                onChange={(n) => setSessions(Math.max(1, n))}
              />
            </label>
            <label>
              <span className="label">Valid for (days)</span>
              <NumberField
                className="input bg-white"
                min={1}
                max={365}
                value={validity}
                onChange={(n) => setValidity(Math.max(1, n))}
              />
            </label>
            <label>
              <span className="label">Package price ₹</span>
              <NumberField
                className="input bg-white"
                min={0}
                value={price}
                disabled={perVisit > 0}
                onChange={setPrice}
              />
            </label>
            <label>
              <span className="label">Or rate ₹ / visit</span>
              <NumberField
                className="input bg-white"
                min={0}
                value={perVisit}
                onChange={setPerVisit}
              />
            </label>
            <span className="sm:col-span-2 text-[11px] text-slate-400">
              Set a per-visit rate for a daily-basis patient — the case then bills what they attend, and
              the package price is ignored.
            </span>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Start date</span>
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            <span className="label">End date</span>
            <input
              className="input"
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Blank = {validity} days from the start
            </span>
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Payment</label>
            <div className="flex flex-wrap gap-2">
              {PAY_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setPayment(m)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition
                    ${payment === m ? "border-brand bg-brand/5 text-brand-deep" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="label">Taking now (instalment)</span>
            <NumberField
              className="input"
              min={0}
              value={advance}
              onChange={setAdvance}
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="label">Diagnosis for this case</label>
          <input
            className="input uppercase"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value.toUpperCase())}
          />
        </div>

        <div className="mt-4">
          <label className="label">Category</label>
          <div className="flex gap-2">
            {categories.active.map((c) => (
              <button
                key={c.code}
                onClick={() => setCategory(c.code)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition
                  ${category === c.code ? "border-brand bg-brand/5 text-brand" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {c.code} · {c.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-600">
            {perVisit > 0 ? `${rupees(perVisit)} / visit` : rupees(price)}
          </span>
          <span className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!name.trim() || start.isPending}
              onClick={() => start.mutate()}
            >
              {start.isPending && <Loader2 size={16} className="animate-spin" />}
              Start case
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
