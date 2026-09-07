"use client";

/**
 * The owner's money screen. Deliberately separate from the patient console: the
 * front desk needs to take payments, but total revenue and the debtors ledger are
 * the owner's business, so this whole route is gated on the OWNER role.
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  IndianRupee,
  Loader2,
  Printer,
  ReceiptText,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  apiError,
  currentStaff,
  isAuthError,
  longDate,
  rupees,
  shortDate,
  signOutStaff,
  type BillingReport,
  type Staff,
} from "@/lib/api";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The windows a clinic actually asks for, rather than a free-form date maze. */
function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const today = iso(now);
  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  return [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: iso(weekStart), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: iso(lastMonthStart), to: iso(lastMonthEnd) },
    { label: "All time", from: "", to: "" },
  ];
}

export default function BillingPage() {
  const router = useRouter();
  // Starts null on purpose: reading localStorage in the initialiser runs on the
  // server too, where it is empty, so the first client render would differ and
  // hydration would fail. The effect below fills it in after mount.
  const [me, setMe] = useState<Staff | null>(null);

  const spans = useMemo(presets, []);
  const [from, setFrom] = useState(spans[2].from); // this month, the usual question
  const [to, setTo] = useState(spans[2].to);

  useEffect(() => {
    const who = currentStaff();
    setMe(who);
    if (!localStorage.getItem("bwell_staff_token")) router.replace("/admin/login");
    else if (who && who.role !== "OWNER") router.replace("/admin");
  }, [router]);

  const report = useQuery({
    queryKey: ["billing", from, to],
    queryFn: async () =>
      (
        await api.get<BillingReport>("/admin/billing", {
          params: { from: from || undefined, to: to || undefined },
        })
      ).data,
    enabled: !!me,
  });

  useEffect(() => {
    if (isAuthError(report.error)) {
      signOutStaff();
      router.replace("/admin/login");
    }
  }, [report.error, router]);

  const data = report.data;
  const totals = data?.totals;
  const printHref = `/print?doc=daybook${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
  const active = spans.find((s) => s.from === from && s.to === to)?.label;

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <ClinicMark size={38} />
            <span className="text-sm font-bold tracking-tight">B-WELL · BILLING</span>
          </Link>
          <span className="flex items-center gap-3">
            <Link href={printHref} target="_blank" className="btn-ghost py-2 text-xs">
              <Printer size={14} /> Print collection report
            </Link>
            <Link href="/admin" className="btn-ghost py-2 text-xs">
              <ArrowLeft size={14} /> Console
            </Link>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-lg font-bold">Billing &amp; collections</h1>
        <p className="mt-1 text-sm text-slate-500">
          Money taken in the chosen period, and every rupee still owed — dues are always shown in
          full, because a balance raised in March is still owed in June.
        </p>

        {/* ------------------------------------------------------- period */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CalendarRange size={15} className="text-slate-400" />
          {spans.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                setFrom(s.from);
                setTo(s.to);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                active === s.label
                  ? "bg-brand text-white ring-brand"
                  : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-2 flex items-center gap-2 text-xs text-slate-500">
            <input
              type="date"
              className="input w-auto px-2 py-1 text-xs"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Collections from"
            />
            to
            <input
              type="date"
              className="input w-auto px-2 py-1 text-xs"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Collections to"
            />
          </span>
          {report.isFetching && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>

        {report.error && !isAuthError(report.error) && (
          <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {apiError(report.error, "Could not load the billing figures")}
          </p>
        )}

        {/* --------------------------------------------------------- KPIs */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Collected in period",
              value: rupees(totals?.collected),
              note: `${totals?.receipts ?? 0} receipt${totals?.receipts === 1 ? "" : "s"}`,
              icon: Wallet,
              tone: "text-brand bg-brand/5",
            },
            {
              label: "Collected today",
              value: rupees(totals?.collected_today),
              note: longDate(new Date().toISOString()),
              icon: IndianRupee,
              tone: "text-emerald-600 bg-emerald-50",
            },
            {
              label: "Outstanding now",
              value: rupees(totals?.outstanding),
              note: `${data?.outstanding.length ?? 0} case${data?.outstanding.length === 1 ? "" : "s"} unpaid`,
              icon: TriangleAlert,
              tone: "text-amber-600 bg-amber-50",
            },
            {
              label: "Billed lifetime",
              value: rupees(totals?.billed_lifetime),
              note: `${rupees(totals?.collected_lifetime)} collected`,
              icon: ReceiptText,
              tone: "text-slate-600 bg-slate-100",
            },
          ].map(({ label, value, note, icon: Icon, tone }) => (
            <div key={label} className="card flex items-center gap-4 p-5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xl font-bold tabular-nums">{value}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="truncate text-[11px] text-slate-400">{note}</p>
              </div>
            </div>
          ))}
        </div>

        {!!data?.unbilled.length && (
          <div className="card mt-4 border-amber-200 bg-amber-50/60 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
              <TriangleAlert size={14} /> {data.unbilled.length} running case
              {data.unbilled.length > 1 ? "s carry" : " carries"} no fee
            </p>
            <p className="mt-1 text-xs text-amber-800/80">
              Neither a package fee nor a per-visit rate was set, so these bill ₹0. Open the case and
              set the fee before the course finishes.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {data.unbilled.map((row) => (
                <li key={row.package_id}>
                  <Link
                    href={`/admin?open=${row.patient_id}`}
                    className="font-semibold uppercase text-amber-900 hover:underline"
                  >
                    {row.full_name}
                  </Link>
                  <span className="ml-1 text-amber-800/70">
                    · {row.package_name} · {row.sessions} done
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* ------------------------------------------- receipts register */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-bold">Receipts register</h2>
              <span className="text-xs font-semibold text-slate-400">
                {data?.ledger.length ?? 0} in period
              </span>
            </div>
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Receipt</th>
                    <th className="px-4 py-2 font-semibold">Patient</th>
                    <th className="px-4 py-2 font-semibold">Mode</th>
                    <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {report.isPending && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {data?.ledger.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No money came in during this period.
                      </td>
                    </tr>
                  )}
                  {data?.ledger.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className="block font-mono text-xs font-semibold">
                          {r.receipt_no ?? "—"}
                        </span>
                        <span className="text-[11px] text-slate-400">{shortDate(r.paid_on)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="block truncate text-xs font-semibold uppercase">
                          {r.full_name}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {r.uhid ?? r.phone_number} · case {r.case_no}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs">{r.mode}</span>
                        {r.recorded_by && (
                          <span className="block text-[11px] text-slate-400">{r.recorded_by}</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-right text-sm font-semibold tabular-nums ${
                          r.amount < 0 ? "text-rose-600" : ""
                        }`}
                      >
                        {rupees(r.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/print?doc=receipt&patient=${r.patient_id}&package=${r.package_id}&receipt=${r.id}`}
                          target="_blank"
                          title="Print this receipt"
                          className="text-slate-400 hover:text-brand-deep"
                        >
                          <Printer size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ------------------------------------------------- breakdowns */}
          <div className="space-y-6">
            <Panel title="Collection by mode">
              {data?.by_mode.length === 0 && <Empty>Nothing collected.</Empty>}
              {data?.by_mode.map((m) => (
                <Bar
                  key={m.mode}
                  label={m.mode}
                  note={`${m.receipts} receipt${m.receipts === 1 ? "" : "s"}`}
                  value={m.amount}
                  max={Math.max(...data.by_mode.map((x) => x.amount), 1)}
                />
              ))}
            </Panel>

            <Panel title="Day by day">
              {data?.by_day.length === 0 && <Empty>No receipts in this period.</Empty>}
              <div className="max-h-64 overflow-y-auto">
                {data?.by_day.map((d) => (
                  <Bar
                    key={d.date}
                    label={shortDate(d.date)}
                    note={`${d.receipts}`}
                    value={d.amount}
                    max={Math.max(...data.by_day.map((x) => x.amount), 1)}
                  />
                ))}
              </div>
            </Panel>

            <Panel title="Ageing of dues">
              {data?.ageing.length === 0 && <Empty>Every case is settled.</Empty>}
              {data?.ageing.map((b) => (
                <Bar
                  key={b.bucket}
                  label={b.bucket}
                  note={`${b.cases} case${b.cases === 1 ? "" : "s"}`}
                  value={b.amount}
                  max={Math.max(...data.ageing.map((x) => x.amount), 1)}
                  tone="bg-amber-500"
                />
              ))}
            </Panel>
          </div>
        </div>

        {/* ------------------------------------------------- debtors ledger */}
        <section className="card mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-bold">Outstanding ledger</h2>
              <p className="text-xs text-slate-500">
                Oldest first. Includes closed cases — finishing the course does not clear the debt.
              </p>
            </div>
            <span className="text-sm font-bold tabular-nums text-amber-700">
              {rupees(totals?.outstanding)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">UHID</th>
                  <th className="px-4 py-2 font-semibold">Patient</th>
                  <th className="px-4 py-2 font-semibold">Treatment</th>
                  <th className="px-4 py-2 font-semibold">Age</th>
                  <th className="px-4 py-2 text-right font-semibold">Billed</th>
                  <th className="px-4 py-2 text-right font-semibold">Paid</th>
                  <th className="px-4 py-2 text-right font-semibold">Due</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data?.outstanding.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      Every case is settled.
                    </td>
                  </tr>
                )}
                {data?.outstanding.map((r) => (
                  <tr key={r.package_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">{r.uhid ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className="block text-xs font-semibold uppercase">{r.full_name}</span>
                      <span className="font-mono text-[11px] text-slate-400">{r.phone_number}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.package_name}
                      <span className="ml-1 text-slate-400">· case {r.case_no}</span>
                      {!r.is_active && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          closed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                          r.days > 90
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : r.days > 30
                              ? "bg-amber-50 text-amber-800 ring-amber-200"
                              : "bg-slate-50 text-slate-600 ring-slate-200"
                        }`}
                      >
                        {r.bucket}
                      </span>
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {r.last_paid_on ? `last paid ${shortDate(r.last_paid_on)}` : "never paid"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{rupees(r.billed)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-brand-deep">
                      {rupees(r.paid)}
                    </td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-amber-700">
                      {rupees(r.balance)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/print?doc=bill&patient=${r.patient_id}&package=${r.package_id}`}
                        target="_blank"
                        title="Print the bill for this case"
                        className="text-slate-400 hover:text-brand-deep"
                      >
                        <Printer size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- pieces */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-slate-400">{children}</p>
);

function Bar({
  label,
  note,
  value,
  max,
  tone = "bg-brand",
}: {
  label: string;
  note: string;
  value: number;
  max: number;
  tone?: string;
}) {
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-slate-500">{rupees(value)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
          <div
            className={`h-1.5 rounded-full ${tone}`}
            style={{ width: `${Math.max(2, (Math.abs(value) / max) * 100)}%` }}
          />
        </div>
        <span className="w-16 shrink-0 text-right text-[10px] text-slate-400">{note}</span>
      </div>
    </div>
  );
}
