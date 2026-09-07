"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarDays,
  CircleDashed,
  Check,
  History,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ClinicMark, { ClinicWatermark } from "@/lib/ClinicMark";
import {
  api,
  useCategories,
  PHASE_COLOR,
  roadmapFor,
  rupees,
  shortDate,
  type PatientPayload,
} from "@/lib/api";

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function PortalPage() {
  const categories = useCategories();
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState(1);
  const [viewPackageId, setViewPackageId] = useState<string | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ["me", viewPackageId],
    queryFn: async () =>
      (await api.get<PatientPayload>("/patient/me", { params: { package_id: viewPackageId } })).data,
  });

  useEffect(() => {
    if (isError) router.replace("/login");
  }, [isError, router]);

  if (isPending || isError) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </main>
    );
  }

  const { patient, sessions, completed_sessions, is_package_completed, packages, household } = data;
  const pkg = data.package;
  const total = sessions.length || 10;
  const byDay = new Map(sessions.map((s) => [s.session_day, s]));
  const selected = byDay.get(selectedDay);
  const roadmapDay = roadmapFor(selectedDay);
  const category = categories.of(patient.category);
  const viewingOld = !!pkg && !pkg.is_active;

  const openCase = (id: string) => {
    setViewPackageId(id);
    setSelectedDay(1);
  };

  const logout = () => {
    localStorage.removeItem("bwell_token");
    router.replace("/login");
  };

  return (
    <main className="min-h-screen pb-16">
      <ClinicWatermark />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ClinicMark size={38} />
            <span className="text-sm font-bold tracking-tight">B-WELL PHYSIOTHERAPY CLINIC</span>
          </div>
          <button onClick={logout} className="btn-ghost py-2 text-xs">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {/* ---------------------------------------------------------- profile */}
        <section className="card overflow-hidden">
          <div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${category.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${category.dot}`} />
                {category.label}
              </span>
              <h1 className="mt-3 truncate text-2xl font-bold uppercase tracking-tight">
                {patient.full_name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {patient.age} yrs · {patient.gender} · Patient since{" "}
                {new Date(patient.created_at).toLocaleDateString("en-IN")} ·{" "}
                {packages.length} course{packages.length === 1 ? "" : "s"} of treatment
              </p>
            </div>
            <dl className="grid shrink-0 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Field icon={Phone} label="Contact" value={patient.phone_number} mono />
              <Field icon={Phone} label="Alternate" value={patient.alt_phone} mono />
              <Field icon={Mail} label="Email" value={patient.email} />
              <Field icon={Stethoscope} label="Referred by" value={patient.referring_doctor} />
            </dl>
          </div>
          <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
            <div className="bg-slate-50/70 px-7 py-4">
              <p className="label mb-1">Diagnosis</p>
              <p className="text-sm font-semibold uppercase">{patient.diagnosis || "—"}</p>
            </div>
            <div className="bg-slate-50/70 px-7 py-4">
              <p className="label mb-1 flex items-center gap-1.5">
                <MapPin size={12} /> Address
              </p>
              <p className="text-sm uppercase">{patient.address || "—"}</p>
            </div>
          </div>
        </section>

        {/* --------------------------------------- everyone else on this number */}
        {household.length > 0 && (
          <section className="card p-7">
            <h2 className="flex items-center gap-2 font-bold">
              <Users size={17} className="text-amber-600" />
              Also registered on {patient.phone_number}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {household.length + 1} people use this number. Each has a separate login — yours signs you in
              as {patient.full_name}.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {household.map((h) => (
                <div key={h.id} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold uppercase">{h.full_name}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                        categories.of(h.category).chip
                      }`}
                    >
                      {h.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {h.cases} checkup{h.cases === 1 ? "" : "s"} so far
                    {h.package_name && ` · now on ${h.package_name}`}
                  </p>
                  {h.total_sessions > 0 && (
                    <>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${(h.completed_sessions / h.total_sessions) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] font-semibold text-slate-400">
                        {h.completed_sessions}/{h.total_sessions} sessions done
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------- package */}
        <section className="card p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">{pkg?.package_name ?? "No active package"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {pkg
                  ? `${shortDate(pkg.start_date)} → ${shortDate(pkg.end_date)} · ${pkg.total_sessions} session${pkg.total_sessions === 1 ? "" : "s"} · ${
                      pkg.per_visit_rate
                        ? `${rupees(pkg.per_visit_rate)} per visit`
                        : rupees(pkg.price)
                    } by ${pkg.payment_mode}`
                  : "Contact the front desk to activate a rehab package."}
              </p>
            </div>
            {is_package_completed && !pkg?.per_visit_rate ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                <BadgeCheck size={15} /> {pkg?.package_name ?? "Package"} Completed
              </span>
            ) : (
              <span className="rounded-full bg-brand/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-deep ring-1 ring-brand/20">
                {viewingOld ? "Closed" : "Active"} · {completed_sessions}/{total} sessions
              </span>
            )}
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${(completed_sessions / total) * 100}%` }}
            />
          </div>

          {pkg && (
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Wallet size={12} /> Billing
              </span>
              <span>
                <span className="text-slate-500">Billed</span>{" "}
                <span className="font-semibold">{rupees(data.billed)}</span>
                {pkg.per_visit_rate > 0 && (
                  <span className="ml-1 text-xs text-slate-400">
                    ({completed_sessions} visit{completed_sessions === 1 ? "" : "s"} ×{" "}
                    {rupees(pkg.per_visit_rate)})
                  </span>
                )}
              </span>
              <span>
                <span className="text-slate-500">Paid</span>{" "}
                <span className="font-semibold text-brand-deep">{rupees(data.paid)}</span>
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                  data.balance <= 0
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-amber-50 text-amber-800 ring-amber-200"
                }`}
              >
                {data.balance > 0
                  ? `${rupees(data.balance)} due`
                  : data.balance < 0
                    ? `${rupees(-data.balance)} credit`
                    : "Fully paid"}
              </span>
              {data.charges.length > 0 && (
                <span className="text-xs text-slate-400">
                  {data.charges
                    .map(
                      (ch) =>
                        `${ch.description}${ch.quantity > 1 ? ` ×${ch.quantity}` : ""} ${rupees(ch.amount * ch.quantity)}`,
                    )
                    .join(" · ")}
                </span>
              )}
              {data.payments.length > 0 && (
                <span className="text-xs text-slate-400">
                  {data.payments.length} receipt{data.payments.length === 1 ? "" : "s"}:{" "}
                  {data.payments
                    .map((p) => `${rupees(p.amount)} ${p.mode} on ${shortDate(p.paid_on)}`)
                    .join(" · ")}
                </span>
              )}
            </div>
          )}

          {packages.length > 1 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="label mb-2 flex items-center gap-1.5">
                <History size={12} /> Your checkups
              </p>
              <div className="flex flex-wrap gap-2">
                {packages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openCase(p.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-[11px] transition
                      ${p.id === pkg?.id ? "border-brand bg-brand/5/60" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <span className="block font-semibold text-slate-700">{p.package_name}</span>
                    <span className="text-slate-500">
                      {shortDate(p.start_date)} → {shortDate(p.end_date)} · {p.completed_sessions}/
                      {p.total_sessions} done
                      {p.is_active && <span className="ml-1 font-semibold text-brand">● current</span>}
                    </span>
                  </button>
                ))}
              </div>
              {viewingOld && (
                <button
                  onClick={() => openCase("")}
                  className="mt-3 text-xs font-semibold text-brand-deep hover:underline"
                >
                  ← Back to my current package
                </button>
              )}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------- roadmap */}
        <section className="card p-7">
          <h2 className="font-bold">Cartilage &amp; Rehabilitation Roadmap</h2>
          <p className="mt-1 text-sm text-slate-500">Tap any day to see its protocol.</p>

          <div className="mt-7 overflow-x-auto pb-2">
            <div
              className="relative flex items-start justify-between"
              style={{ minWidth: `${total * 64}px` }}
            >
              <div className="absolute left-5 right-5 top-5 h-0.5 bg-slate-200" />
              <div
                className="absolute left-5 top-5 h-0.5 bg-brand transition-all duration-500"
                style={{ width: `calc((100% - 2.5rem) * ${completed_sessions / total})` }}
              />
              {sessions.map(({ session_day: day }) => {
                const { phase } = roadmapFor(day);
                const log = byDay.get(day);
                const done = !!log?.is_verified;
                const active = day === selectedDay;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className="relative z-10 flex w-14 flex-col items-center gap-2"
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition
                        ${done ? "bg-brand text-white" : "border-2 border-slate-300 bg-white text-slate-400"}
                        ${active ? "ring-4 ring-brand/25" : ""}`}
                    >
                      {done ? <Check size={18} strokeWidth={3} /> : day}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase ${active ? "text-brand-deep" : "text-slate-400"}`}>
                      Day {day}
                    </span>
                    <span className="text-center text-[9px] leading-tight text-slate-400">{phase}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold">Day {selectedDay}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${PHASE_COLOR[roadmapDay.phase]}`}>
                {roadmapDay.phase}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                {selected?.is_verified ? (
                  <>
                    <Check size={14} className="text-brand" /> Attended {fmt(selected.session_date)}
                  </>
                ) : (
                  <>
                    <CircleDashed size={14} /> Not yet attended
                  </>
                )}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Planned:</span> {roadmapDay.goal}
            </p>
            {selected?.protocol_note && (
              <p className="mt-1.5 text-sm text-slate-600">
                <span className="font-semibold text-slate-700">Therapist note:</span> {selected.protocol_note}
              </p>
            )}
            {selected?.attended_by && (
              <p className="mt-1.5 text-sm text-slate-600">
                <span className="font-semibold text-slate-700">Attended by:</span> {selected.attended_by}
              </p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- attendance */}
        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-7 py-5">
            <CalendarDays size={17} className="text-brand" />
            <h2 className="font-bold">Attendance Log</h2>
            {viewingOld && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                past checkup
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-7 py-3 font-semibold">Day</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Treatment Protocol</th>
                <th className="px-4 py-3 font-semibold">Attended By</th>
                <th className="px-7 py-3 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s.id} className={s.is_verified ? "" : "text-slate-400"}>
                  <td className="px-7 py-3.5 font-semibold text-slate-700">Day {s.session_day}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">{fmt(s.session_date)}</td>
                  <td className="px-4 py-3.5">
                    {s.protocol_note || <span className="italic">{roadmapFor(s.session_day).goal}</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap uppercase">{s.attended_by || "—"}</td>
                  <td className="px-7 py-3.5 text-right">
                    {s.is_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand/5 px-2.5 py-1 text-[11px] font-semibold text-brand-deep ring-1 ring-brand/20">
                        <Check size={12} /> Completed
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold uppercase">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof User;
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon size={12} /> {label}
      </dt>
      <dd className={`mt-0.5 ${mono ? "font-mono" : ""} text-slate-700`}>{value || "—"}</dd>
    </div>
  );
}
