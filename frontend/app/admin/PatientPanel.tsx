"use client";

import { useMutation } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarPlus,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Stethoscope,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  KeyRound,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  api,
  apiError,
  useCategories,
  PAY_MODES,
  roadmapFor,
  rupees,
  shortDate,
  useCatalogue,
  type Package,
  type Patient,
  type PatientPayload,
  type SessionLog,
} from "@/lib/api";
import { waHref } from "@/lib/clinic";
import NumberField from "@/lib/NumberField";

/**
 * The whole panel edits into local drafts; nothing reaches the server until Save.
 * Remount it (key on patient + package) to drop drafts when the selection changes.
 */
export default function PatientPanel({
  data,
  onSelectPatient,
  onPickPackage,
  onNewCase,
  onChanged,
}: {
  data: PatientPayload;
  onSelectPatient: (id: string) => void;
  onPickPackage: (id: string) => void;
  onNewCase: () => void;
  onChanged: () => void;
}) {
  const categories = useCategories();
  const patient = data.patient;
  const pkg = data.package;
  const packages = data.packages;
  const housemates = data.shared_number_with ?? [];
  const caseNumber = pkg ? packages.length - packages.findIndex((p) => p.id === pkg.id) : 0;

  const therapists = useCatalogue("THERAPIST");
  const addons = useCatalogue("ADDON");

  const [person, setPerson] = useState<Partial<Patient>>({});
  const [plan, setPlan] = useState<Partial<Package>>({});
  const [visits, setVisits] = useState<Record<string, Partial<SessionLog>>>({});
  const [error, setError] = useState("");
  const [login, setLogin] = useState<{ login_id: string; password: string } | null>(null);

  const fail = (fallback: string) => (err: unknown) => setError(apiError(err, fallback));
  const done = () => {
    setError("");
    onChanged();
  };

  const savePatient = useMutation({
    mutationFn: async () => (await api.put(`/admin/patients/${patient.id}`, person)).data,
    onSuccess: () => {
      setPerson({});
      done();
    },
    onError: fail("Could not save the patient"),
  });

  // Codes are hashed, so staff can never read one back — only reissue it, shown once.
  const resetLogin = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/patients/${patient.id}/reset-login`, {})).data as {
        login_id: string;
        password: string;
      },
    onSuccess: (d) => {
      setError("");
      setLogin(d);
    },
    onError: fail("Could not reset the login code"),
  });

  const savePackage = useMutation({
    mutationFn: async () => (await api.put(`/admin/packages/${pkg!.id}`, plan)).data,
    onSuccess: () => {
      setPlan({});
      done();
    },
    onError: fail("Could not save the package"),
  });

  const saveVisits = useMutation({
    mutationFn: async () => {
      for (const [id, patch] of Object.entries(visits)) {
        await api.put(`/admin/attendance/${id}`, patch);
      }
    },
    onSuccess: () => {
      setVisits({});
      done();
    },
    onError: fail("Could not save the sessions"),
  });

  const addVisit = useMutation({
    mutationFn: async () => (await api.post(`/admin/packages/${pkg!.id}/sessions?count=1`)).data,
    onSuccess: done,
    onError: fail("Could not add a visit"),
  });

  /** Draft value if the row has been touched, otherwise whatever the server sent. */
  const pick = <T, K extends keyof T>(draft: Partial<T> | undefined, saved: T | null, key: K) =>
    (draft?.[key] ?? saved?.[key] ?? "") as string | number | boolean;

  const field = <K extends keyof Patient>(key: K) => pick(person, patient, key) as string | number;
  const planField = <K extends keyof Package>(key: K) =>
    pick(plan, pkg ?? null, key) as string | number;
  const visitField = <K extends keyof SessionLog>(s: SessionLog, key: K) =>
    pick(visits[s.id], s, key);

  const editVisit = (id: string, patch: Partial<SessionLog>) =>
    setVisits((v) => ({ ...v, [id]: { ...v[id], ...patch } }));

  const dirtyVisits = Object.keys(visits).length;
  const dirtyPerson = Object.keys(person).length;
  const dirtyPlan = Object.keys(plan).length;
  const perVisit = (pkg?.per_visit_rate ?? 0) > 0;

  // What the case would bill if the pending fee edit were saved.
  const extras = data.charges.reduce((sum, c) => sum + c.amount * c.quantity, 0);
  const pendingBilled =
    (perVisit
      ? Number(planField("per_visit_rate")) * data.completed_sessions
      : Number(planField("price"))) + extras;
  // Billing under what has been collected is money owed back, not a saving.
  const underBilled = dirtyPlan > 0 && pendingBilled < data.paid;

  return (
    <>
      {/* ------------------------------------------------- patient, editable */}
      <div className="border-b border-slate-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <UserRound size={12} /> {patient.age} yrs
            </span>
            <span className="font-mono">{patient.phone_number}</span>
            <span className="flex items-center gap-1">
              <Stethoscope size={12} /> case {caseNumber} of {packages.length}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                categories.of(patient.category).chip
              }`}
            >
              {categories.of(patient.category).label}
            </span>
            {/* a daily-basis card is never "completed" — they simply have not come back */}
            {data.is_package_completed && !perVisit && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
                <BadgeCheck size={14} /> {pkg?.package_name} Completed
              </span>
            )}
            <span className="flex flex-wrap justify-end gap-2">
              {pkg && (
                <>
                  <Link
                    href={`/print?doc=record&patient=${patient.id}&package=${pkg.id}`}
                    target="_blank"
                    title="Session-wise treatment record on the clinic letterhead"
                    className="btn-ghost py-2 text-xs"
                  >
                    <Printer size={14} /> Record
                  </Link>
                  <Link
                    href={`/print?doc=prescription&patient=${patient.id}&package=${pkg.id}`}
                    target="_blank"
                    title="Prescription on the clinic letterhead, for the patient to take away"
                    className="btn-ghost py-2 text-xs"
                  >
                    <Printer size={14} /> Prescription
                  </Link>
                  <Link
                    href={`/print?doc=bill&patient=${patient.id}&package=${pkg.id}`}
                    target="_blank"
                    title="Itemised bill for this case"
                    className="btn-ghost py-2 text-xs"
                  >
                    <Printer size={14} /> Bill
                  </Link>
                </>
              )}
              <button className="btn-ghost py-2 text-xs" onClick={onNewCase}>
                <Plus size={14} /> New case
              </button>
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Text label="Full name" value={field("full_name")} upper onChange={(v) => setPerson({ ...person, full_name: v })} />
          <Text label="Age" type="number" value={field("age")} onChange={(v) => setPerson({ ...person, age: Number(v) })} />
          <Select
            label="Gender"
            value={field("gender")}
            options={["FEMALE", "MALE", "OTHER"]}
            onChange={(v) => setPerson({ ...person, gender: v })}
          />
          <Select
            label="Category"
            value={field("category")}
            options={["A", "B", "C"]}
            onChange={(v) => setPerson({ ...person, category: v as Patient["category"] })}
          />
          <Text label="Alt phone" value={field("alt_phone") ?? ""} onChange={(v) => setPerson({ ...person, alt_phone: v })} />
          <Text label="Email" value={field("email") ?? ""} onChange={(v) => setPerson({ ...person, email: v })} />
          <Text
            label="Referring doctor"
            upper
            value={field("referring_doctor") ?? ""}
            onChange={(v) => setPerson({ ...person, referring_doctor: v })}
          />
          <Text
            label="Diagnosis"
            upper
            value={field("diagnosis") ?? ""}
            onChange={(v) => setPerson({ ...person, diagnosis: v })}
          />
          <Text
            label="Address"
            upper
            className="sm:col-span-2"
            value={field("address") ?? ""}
            onChange={(v) => setPerson({ ...person, address: v })}
          />
          <Text
            label="Requirements / precautions"
            className="sm:col-span-2"
            value={field("requirements") ?? ""}
            onChange={(v) => setPerson({ ...person, requirements: v })}
          />
        </div>

        <SaveBar
          dirty={dirtyPerson}
          pending={savePatient.isPending}
          onSave={() => savePatient.mutate()}
          onDiscard={() => setPerson({})}
          hint="The phone number is the login and cannot be changed here."
        />
      </div>

      {/* ----------------------------------------------- patient portal login */}
      <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Patient portal login
          </span>
          <span className="text-xs text-slate-600">
            Login ID <span className="font-mono font-semibold text-slate-800">{patient.phone_number}</span>
          </span>
          <span className="text-xs text-slate-500">
            Password <span className="text-slate-400">•••••• (stored hashed — cannot be shown)</span>
          </span>
          <button
            onClick={() => resetLogin.mutate()}
            disabled={resetLogin.isPending}
            className="btn-ghost ml-auto py-1.5 text-xs"
            title="Issue a new code — the patient’s current one stops working"
          >
            {resetLogin.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <KeyRound size={12} />
            )}{" "}
            Reset login code
          </button>
        </div>
        {login && (
          <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <span>
              New code: <span className="select-all font-mono font-bold">{login.password}</span>
            </span>
            <a
              className="btn-primary py-1 text-xs"
              target="_blank"
              rel="noopener noreferrer"
              href={waHref(
                login.login_id,
                `B-WELL Physiotherapy Clinic
Your patient portal login
Login ID (phone): ${login.login_id}
Password: ${login.password}

Please keep this private.`,
              )}
            >
              <MessageCircle size={13} /> Send on WhatsApp
            </a>
            <span className="text-[11px] text-emerald-700">Shown once — the old code no longer works.</span>
            <button
              className="ml-auto text-xs font-semibold text-emerald-700 hover:underline"
              onClick={() => setLogin(null)}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------ everyone on this number */}
      {housemates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50/60 px-6 py-3">
          <Users size={14} className="text-amber-700" />
          <span className="text-xs font-semibold text-amber-900">
            {patient.phone_number} is shared by {housemates.length + 1} patients:
          </span>
          {housemates.map((h) => (
            <button
              key={h.id}
              onClick={() => onSelectPatient(h.id)}
              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-700 ring-1 ring-amber-200 transition hover:ring-amber-400"
              title={`${h.diagnosis ?? ""} · ${h.cases} case${h.cases === 1 ? "" : "s"}`}
            >
              {h.full_name}
              <span className="ml-1.5 font-normal normal-case text-slate-400">
                {h.completed_sessions}/{h.total_sessions || "—"}
              </span>
            </button>
          ))}
          <Link
            href={`/register?phone=${patient.phone_number}`}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:underline"
          >
            <UserPlus size={12} /> Add another on this number
          </Link>
        </div>
      ) : (
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-2.5 text-right">
          <Link
            href={`/register?phone=${patient.phone_number}`}
            className="text-[11px] font-semibold text-slate-500 hover:text-brand-deep hover:underline"
          >
            <UserPlus size={12} className="mr-1 inline" />
            Register a family member on {patient.phone_number}
          </Link>
        </div>
      )}

      {/* ------------------------------------------------ one tab per case */}
      {packages.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/60 px-6 py-2.5">
          {packages.map((p) => (
            <button
              key={p.id}
              onClick={() => onPickPackage(p.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition
                ${p.id === pkg?.id ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/70"}`}
            >
              {p.package_name} · {shortDate(p.start_date)}
              <span className="ml-1.5 font-normal text-slate-400">
                {p.completed_sessions}/{p.total_sessions}
              </span>
              {p.is_active && <span className="ml-1.5 text-brand">● live</span>}
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ package, editable */}
      {pkg && (
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-6">
            <label className="sm:col-span-2">
              <span className="label">Package</span>
              <input
                className="input bg-white px-2.5 py-1.5 text-xs"
                value={planField("package_name")}
                onChange={(e) => setPlan({ ...plan, package_name: e.target.value })}
              />
            </label>
            <label>
              <span className="label">{perVisit ? "Rate ₹ / visit" : "Package fee ₹"}</span>
              <NumberField
                className="input bg-white px-2.5 py-1.5 text-xs"
                min={0}
                value={Number(perVisit ? planField("per_visit_rate") : planField("price"))}
                onChange={(n) => setPlan({ ...plan, [perVisit ? "per_visit_rate" : "price"]: n })}
              />
            </label>
            <label>
              <span className="label">Start</span>
              <input
                className="input bg-white px-2.5 py-1.5 text-xs"
                type="date"
                value={planField("start_date")}
                onChange={(e) => setPlan({ ...plan, start_date: e.target.value })}
              />
            </label>
            <label>
              <span className="label">End</span>
              <input
                className="input bg-white px-2.5 py-1.5 text-xs"
                type="date"
                min={String(planField("start_date"))}
                value={planField("end_date") ?? ""}
                onChange={(e) => setPlan({ ...plan, end_date: e.target.value || null })}
              />
            </label>
            <label>
              <span className="label">Paid by</span>
              <select
                className="input bg-white px-2.5 py-1.5 text-xs"
                value={planField("payment_mode")}
                onChange={(e) => setPlan({ ...plan, payment_mode: e.target.value })}
              >
                {PAY_MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          {underBilled && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-amber-200">
              <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber-700" />
              <span>
                A fee of {rupees(pendingBilled)} is below the {rupees(data.paid)} already collected,
                which would leave {rupees(data.paid - pendingBilled)} to refund. If you meant to record
                a payment, use <span className="font-semibold">Take payment</span> in Billing instead.
              </span>
            </p>
          )}
          <SaveBar
            dirty={dirtyPlan}
            pending={savePackage.isPending}
            saveLabel={underBilled ? "Save anyway" : undefined}
            onSave={() => savePackage.mutate()}
            onDiscard={() => setPlan({})}
            hint={
              perVisit
                ? "Daily basis — the case bills this rate for every visit attended. Money received goes in Billing below."
                : "The agreed fee, not money received. To record a payment use Take payment in Billing below."
            }
          />
        </div>
      )}

      {/* --------------------------------------------------------- billing */}
      {pkg && (
        <Billing
          pkg={pkg}
          data={data}
          addons={addons.data ?? []}
          onChanged={onChanged}
          onError={setError}
        />
      )}

      {/* -------------------------------------------------------- sessions */}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-14 px-4 py-3 text-center font-semibold">Done</th>
            <th className="w-12 px-2 py-3 font-semibold">{perVisit ? "Visit" : "Day"}</th>
            <th className="w-36 px-2 py-3 font-semibold">Session Date</th>
            <th className="px-2 py-3 font-semibold">Protocol Note</th>
            <th className="w-48 px-2 py-3 pr-4 font-semibold">Attended By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.sessions.map((s) => {
            const changed = !!visits[s.id];
            return (
              <tr
                key={s.id}
                className={changed ? "bg-amber-50/60" : s.is_verified ? "bg-brand/5/30" : ""}
              >
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand"
                    checked={Boolean(visitField(s, "is_verified"))}
                    onChange={(e) => editVisit(s.id, { is_verified: e.target.checked })}
                  />
                </td>
                <td className="px-2 py-2.5 font-semibold text-slate-700">{s.session_day}</td>
                <td className="px-2 py-2.5">
                  <input
                    type="date"
                    className="input px-2 py-1.5 text-xs"
                    value={(visitField(s, "session_date") as string) ?? ""}
                    onChange={(e) => editVisit(s.id, { session_date: e.target.value || null })}
                  />
                </td>
                <td className="px-2 py-2.5">
                  <input
                    className="input px-2 py-1.5 text-xs"
                    placeholder={roadmapFor(s.session_day).goal}
                    value={(visitField(s, "protocol_note") as string) ?? ""}
                    onChange={(e) => editVisit(s.id, { protocol_note: e.target.value })}
                  />
                </td>
                <td className="px-2 py-2.5 pr-4">
                  <input
                    className="input px-2 py-1.5 text-xs uppercase"
                    list="therapists"
                    placeholder="Therapist / doctor"
                    value={(visitField(s, "attended_by") as string) ?? ""}
                    onChange={(e) => editVisit(s.id, { attended_by: e.target.value.toUpperCase() })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="therapists">
        {(therapists.data ?? []).map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>

      <div className="border-t border-slate-200 px-6 py-3">
        {perVisit && (
          <button
            className="btn-ghost mb-3 py-2 text-xs"
            disabled={addVisit.isPending}
            onClick={() => addVisit.mutate()}
          >
            {addVisit.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CalendarPlus size={13} />
            )}
            Add today&rsquo;s visit
          </button>
        )}
        <SaveBar
          dirty={dirtyVisits}
          pending={saveVisits.isPending}
          onSave={() => saveVisits.mutate()}
          onDiscard={() => setVisits({})}
          hint={`${data.completed_sessions}/${data.sessions.length} sessions verified · billed ${rupees(
            data.billed,
          )}`}
        />
      </div>

      {error && (
        <p className="mx-6 mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------- billing */
function Billing({
  pkg,
  data,
  addons,
  onChanged,
  onError,
}: {
  pkg: Package;
  data: PatientPayload;
  addons: { id: string; name: string; price: number }[];
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState(pkg.payment_mode);
  const [reference, setReference] = useState("");
  const [addon, setAddon] = useState("");
  const [addonQty, setAddonQty] = useState(1);
  const [discount, setDiscount] = useState("");

  const fail = (m: string) => (err: unknown) => onError(apiError(err, m));

  const pay = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/admin/packages/${pkg.id}/payments`, {
          amount: Number(amount),
          paid_on: paidOn,
          mode,
          reference: reference || null,
        })
      ).data,
    onSuccess: () => {
      setAmount("");
      setReference("");
      onChanged();
    },
    onError: fail("Could not record the payment"),
  });

  const unpay = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/payments/${id}`)).data,
    onSuccess: onChanged,
    onError: fail("Could not delete the receipt"),
  });

  const charge = useMutation({
    mutationFn: async (body: { description: string; amount: number; quantity?: number }) =>
      (await api.post(`/admin/packages/${pkg.id}/charges`, body)).data,
    onSuccess: () => {
      setAddon("");
      setAddonQty(1);
      setDiscount("");
      onChanged();
    },
    onError: fail("Could not add the charge"),
  });

  const uncharge = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/charges/${id}`)).data,
    onSuccess: onChanged,
    onError: fail("Could not remove the charge"),
  });

  const settled = data.balance <= 0;
  const picked = addons.find((a) => a.id === addon);

  return (
    <div className="border-b border-slate-200 px-6 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Wallet size={14} className="text-slate-400" /> Billing
        </span>
        <span className="text-sm">
          <span className="text-slate-500">Billed</span>{" "}
          <span className="font-semibold">{rupees(data.billed)}</span>
          {pkg.per_visit_rate > 0 && (
            <span className="ml-1 text-xs text-slate-400">
              ({data.completed_sessions} × {rupees(pkg.per_visit_rate)})
            </span>
          )}
        </span>
        <span className="text-sm">
          <span className="text-slate-500">Paid</span>{" "}
          <span className="font-semibold text-brand-deep">{rupees(data.paid)}</span>
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
            data.balance === 0
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : data.balance > 0
                ? "bg-amber-50 text-amber-800 ring-amber-200"
                : "bg-sky-50 text-sky-800 ring-sky-200"
          }`}
          title={
            data.balance < 0
              ? "Collected more than billed — refund it, or correct the fee"
              : undefined
          }
        >
          {data.balance === 0
            ? "Settled"
            : data.balance > 0
              ? `${rupees(data.balance)} due`
              : `${rupees(-data.balance)} to refund`}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {data.balance > 0 && (
            <button
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={() => {
                setAmount(String(data.balance));
                setOpen(true);
              }}
            >
              <Wallet size={13} /> Take payment
            </button>
          )}
          <button
            className="text-xs font-semibold text-brand-deep hover:underline"
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : `Receipts (${data.payments.length}) · Extras (${data.charges.length})`}
          </button>
        </span>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 lg:grid-cols-2">
          {/* ---------------------------------------------------- receipts */}
          <div>
            <p className="label">Receipts</p>
            {data.payments.length === 0 && (
              <p className="mb-2 text-xs text-slate-400">Nothing collected yet.</p>
            )}
            {data.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-2 border-b border-slate-200 py-1.5 text-xs">
                <span className="w-20 text-slate-500">{shortDate(p.paid_on)}</span>
                <span className="w-24 truncate font-mono text-[11px] text-slate-400">
                  {p.receipt_no ?? "—"}
                </span>
                <span className="w-14">{p.mode}</span>
                <span className="flex-1 truncate text-slate-500">
                  {p.reference || p.note || "—"}
                  {p.recorded_by && (
                    <span className="ml-1 text-slate-400">· {p.recorded_by}</span>
                  )}
                </span>
                <span className={`font-semibold ${p.amount < 0 ? "text-rose-600" : "text-slate-700"}`}>
                  {rupees(p.amount)}
                </span>
                <Link
                  href={`/print?doc=receipt&patient=${data.patient.id}&package=${pkg.id}&receipt=${p.id}`}
                  target="_blank"
                  title={`Print receipt ${p.receipt_no ?? ""}`}
                  className="text-slate-400 hover:text-brand-deep"
                >
                  <Printer size={12} />
                </Link>
                <button onClick={() => unpay.mutate(p.id)} className="text-slate-400 hover:text-rose-600">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label>
                <span className="label">Amount ₹</span>
                <input
                  className="input w-24 bg-white px-2 py-1.5 text-xs"
                  type="number"
                  value={amount}
                  placeholder={String(data.balance > 0 ? data.balance : 0)}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                <span className="label">On</span>
                <input
                  className="input w-32 bg-white px-2 py-1.5 text-xs"
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </label>
              <label>
                <span className="label">Mode</span>
                <select
                  className="input w-24 bg-white px-2 py-1.5 text-xs"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {PAY_MODES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="label">Reference</span>
                <input
                  className="input bg-white px-2 py-1.5 text-xs"
                  value={reference}
                  placeholder="UPI txn / receipt no"
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <button
                className="btn-primary px-3 py-1.5 text-xs"
                disabled={!amount || Number(amount) === 0 || pay.isPending}
                onClick={() => pay.mutate()}
              >
                {pay.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Take payment
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Instalments are just several receipts. A refund is a negative amount.
            </p>
          </div>

          {/* --------------------------------------- add-ons and discounts */}
          <div>
            <p className="label">Extras on this case</p>
            {data.charges.length === 0 && (
              <p className="mb-2 text-xs text-slate-400">No add-ons or discounts.</p>
            )}
            {data.charges.map((ch) => (
              <div key={ch.id} className="flex items-center gap-2 border-b border-slate-200 py-1.5 text-xs">
                <span className="w-20 text-slate-500">{shortDate(ch.charged_on)}</span>
                <span className="flex-1 truncate">
                  {ch.description}
                  {ch.quantity > 1 && <span className="text-slate-400"> ×{ch.quantity}</span>}
                </span>
                <span className={`font-semibold ${ch.amount < 0 ? "text-emerald-600" : "text-slate-700"}`}>
                  {rupees(ch.amount * ch.quantity)}
                </span>
                <button onClick={() => uncharge.mutate(ch.id)} className="text-slate-400 hover:text-rose-600">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="label">Add-on therapy</span>
                <select
                  className="input bg-white px-2 py-1.5 text-xs"
                  value={addon}
                  onChange={(e) => setAddon(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {addons.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — ₹{a.price}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Qty</span>
                <NumberField
                  className="input w-16 bg-white px-2 py-1.5 text-xs"
                  min={1}
                  max={100}
                  value={addonQty}
                  onChange={(n) => setAddonQty(Math.max(1, n))}
                />
              </label>
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                disabled={!picked || charge.isPending}
                onClick={() =>
                  picked &&
                  charge.mutate({ description: picked.name, amount: picked.price, quantity: addonQty })
                }
              >
                <Plus size={13} /> Bill it
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="label">Discount ₹</span>
                <input
                  className="input bg-white px-2 py-1.5 text-xs"
                  type="number"
                  min={0}
                  value={discount}
                  placeholder="e.g. 500"
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                disabled={!discount || Number(discount) <= 0 || charge.isPending}
                onClick={() =>
                  charge.mutate({ description: "Discount", amount: -Math.abs(Number(discount)) })
                }
              >
                Apply
              </button>
            </div>
            {addons.length === 0 && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                No add-on therapies configured — add them under Settings.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- small parts */
function SaveBar({
  dirty,
  pending,
  onSave,
  onDiscard,
  hint,
  saveLabel,
}: {
  dirty: number;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
  hint?: string;
  saveLabel?: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      <span className="ml-auto flex items-center gap-2">
        {dirty > 0 && (
          <>
            <span className="text-[11px] font-semibold text-amber-700">
              {dirty} unsaved change{dirty === 1 ? "" : "s"}
            </span>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onDiscard}>
              <RotateCcw size={13} /> Discard
            </button>
          </>
        )}
        <button
          className="btn-primary px-3 py-1.5 text-xs"
          disabled={!dirty || pending}
          onClick={onSave}
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {dirty ? (saveLabel ?? "Save") : "Saved"}
        </button>
      </span>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  upper,
  className = "",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  upper?: boolean;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {type === "number" ? (
        <NumberField
          className="input px-2.5 py-1.5 text-xs"
          value={Number(value) || 0}
          onChange={(n) => onChange(String(n))}
        />
      ) : (
        <input
          className={`input px-2.5 py-1.5 text-xs ${upper ? "uppercase" : ""}`}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        />
      )}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select
        className="input px-2.5 py-1.5 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
