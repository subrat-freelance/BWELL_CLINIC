"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Copy,
  Loader2,
  CalendarCheck,
  Users,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { waHref } from "@/lib/clinic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  api,
  apiError,
  useCategories,
  PAY_MODES,
  rupees,
  useCatalogue,
  type CatalogueItem,
  type PatientPayload,
} from "@/lib/api";
import NumberField from "@/lib/NumberField";

const STEPS = ["Patient Details", "Clinical Assessment", "Package & Payment"];

const COMMON_DIAGNOSES = [
  "OA KNEE (LT) / CARTILAGE ISSUE",
  "FROZEN SHOULDER (RT)",
  "LUMBAR SPONDYLOSIS",
  "POST-OP ACL RECONSTRUCTION",
  "CERVICAL RADICULOPATHY",
  "CHONDROMALACIA PATELLAE",
];

type Form = {
  full_name: string;
  age: string;
  gender: string;
  phone_number: string;
  alt_phone: string;
  email: string;
  address: string;
  referring_doctor: string;
  category: string;
  diagnosis: string;
  requirements: string;
  package_name: string;
  validity_days: number;
  total_sessions: number;
  price: number;
  per_visit_rate: number;
  advance_amount: number;
  payment_mode: string;
};

const EMPTY: Form = {
  full_name: "",
  age: "",
  gender: "FEMALE",
  phone_number: "",
  alt_phone: "",
  email: "",
  address: "",
  referring_doctor: "",
  category: "A",
  diagnosis: "",
  requirements: "",
  package_name: "",
  validity_days: 10,
  total_sessions: 10,
  price: 0,
  per_visit_rate: 0,
  advance_amount: 0,
  payment_mode: "CASH",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const categories = useCategories();
  // Registration is a counter activity: it writes a patient, a package and its charges
  // into the live register, so only signed-in staff reach it. Someone off the street
  // raises an inquiry from the public site instead.
  useEffect(() => {
    if (!localStorage.getItem("bwell_staff_token")) router.replace("/admin/login");
  }, [router]);
  // Admin links here as /register?phone=… to add a family member on a shared number.
  const prefillPhone = (useSearchParams().get("phone") ?? "").replace(/\D/g, "").slice(0, 10);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({ ...EMPTY, phone_number: prefillPhone });
  const [error, setError] = useState("");
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // Plans come from the clinic's own catalogue, so a new rate needs no deploy.
  const plans = useCatalogue();
  const bookable = plans.data?.filter((p) => p.kind === "PACKAGE" || p.kind === "PER_VISIT");

  const choosePlan = (p: CatalogueItem) =>
    set(
      p.kind === "PER_VISIT"
        ? {
            package_name: p.name,
            per_visit_rate: p.price,
            price: 0,
            // A daily-basis card opens with one visit and grows as they come back.
            total_sessions: 1,
            validity_days: p.validity_days || 30,
            advance_amount: 0,
          }
        : {
            package_name: p.name,
            per_visit_rate: 0,
            price: p.price,
            total_sessions: p.total_sessions,
            validity_days: p.validity_days,
            advance_amount: p.price,
          },
    );

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<PatientPayload & { login_id: string; password: string }>(
        "/auth/register",
        { ...form, age: Number(form.age), email: form.email || null },
      );
      return data;
    },
    onError: (err) => setError(apiError(err, "Registration failed")),
  });

  if (create.isSuccess) return <Done data={create.data} />;

  const step1Ok = form.full_name.trim().length > 1 && form.phone_number.length === 10 && !!form.age;
  const step2Ok = form.diagnosis.trim().length > 2;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href="/admin" className="flex items-center gap-2.5">
          <ClinicMark size={40} />
          <span className="font-bold tracking-tight">B-WELL PHYSIOTHERAPY CLINIC</span>
        </Link>
        <Link href="/admin" className="btn-ghost py-2 text-xs">
          <ArrowLeft size={14} /> Back to console
        </Link>
      </div>
      <p className="-mt-4 mb-6 text-xs text-slate-500">
        New patient registration · front desk only
      </p>

      {/* stepper */}
      <ol className="mb-7 flex items-center gap-2">
        {STEPS.map((title, i) => (
          <li key={title} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold
                ${i <= step ? "bg-brand text-white" : "bg-slate-200 text-slate-500"}`}
            >
              {i + 1}
            </span>
            <span className={`hidden text-xs font-semibold sm:block ${i <= step ? "text-slate-800" : "text-slate-400"}`}>
              {title}
            </span>
            {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 ${i < step ? "bg-brand" : "bg-slate-200"}`} />}
          </li>
        ))}
      </ol>

      {prefillPhone && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
          <Users size={15} className="mt-0.5 shrink-0 text-amber-700" />
          <span>
            Adding a patient on the shared number{" "}
            <span className="font-mono font-bold">{prefillPhone}</span>. Each person on the number gets their own login code, printed on the confirmation screen — no need to change the name.
          </span>
        </div>
      )}

      <div className="card p-7">
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Full Name (stored in CAPS)</label>
              <input
                className="input uppercase"
                value={form.full_name}
                onChange={(e) => set({ full_name: e.target.value.toUpperCase() })}
                placeholder="JYOTIRREKHA MANTRI"
                required
              />
            </div>
            <div>
              <label className="label">Age</label>
              <input
                className="input"
                type="number"
                min={1}
                max={120}
                value={form.age}
                onChange={(e) => set({ age: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Gender</label>
              <select className="input" value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                <option>FEMALE</option>
                <option>MALE</option>
                <option>OTHER</option>
              </select>
            </div>
            <div>
              <label className="label">Primary Phone (becomes Login ID)</label>
              <input
                className="input font-mono tracking-wider"
                inputMode="numeric"
                maxLength={10}
                value={form.phone_number}
                onChange={(e) => set({ phone_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder="9348820192"
              />
            </div>
            <div>
              <label className="label">Alternate Phone</label>
              <input
                className="input font-mono tracking-wider"
                inputMode="numeric"
                maxLength={10}
                value={form.alt_phone}
                onChange={(e) => set({ alt_phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email (optional)</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <textarea
                className="input uppercase"
                rows={2}
                value={form.address}
                onChange={(e) => set({ address: e.target.value.toUpperCase() })}
              />
            </div>
            <p className="sm:col-span-2 rounded-lg bg-brand/5 px-3 py-2.5 text-xs text-brand-deep ring-1 ring-brand/20">
              A random login code is generated when you register this patient and shown once on
              the confirmation screen — print it or write it down for them.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <div>
              <label className="label">Referring Doctor</label>
              <input
                className="input uppercase"
                value={form.referring_doctor}
                onChange={(e) => set({ referring_doctor: e.target.value.toUpperCase() })}
                placeholder="Name of the referring doctor"
              />
            </div>
            <div>
              <label className="label">Diagnosis Category</label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categories.active.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set({ category: c.code })}
                    className={`rounded-xl border p-4 text-left transition
                      ${form.category === c.code ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${categories.of(c.code).dot}`}>
                      {c.code}
                    </span>
                    <p className="mt-2 text-xs font-semibold leading-snug text-slate-700">{c.name}</p>
                  </button>
                ))}
                {categories.active.length === 0 && !categories.isPending && (
                  <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
                    No diagnosis categories are configured. Add them under Settings &rarr;
                    Diagnosis categories.
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="label">Diagnosis</label>
              <input
                className="input uppercase"
                value={form.diagnosis}
                onChange={(e) => set({ diagnosis: e.target.value.toUpperCase() })}
                placeholder="OA KNEE (LT) / CARTILAGE ISSUE"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COMMON_DIAGNOSES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set({ diagnosis: d })}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Treatment Requirements / Precautions</label>
              <textarea
                className="input"
                rows={3}
                value={form.requirements}
                onChange={(e) => set({ requirements: e.target.value })}
                placeholder="Knee brace during gait training, no deep squats, BP monitoring before SWD..."
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5">
            <div>
              <label className="label">Select Package</label>
              {plans.isPending && (
                <p className="text-sm text-slate-400">Loading the clinic&rsquo;s plans&hellip;</p>
              )}
              {!plans.isPending && bookable?.length === 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
                  No plans are set up yet. An admin adds them under Settings &rarr; Rates &amp; Services.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {bookable?.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePlan(p)}
                    className={`rounded-xl border p-4 text-left transition
                      ${form.package_name === p.name ? "border-brand bg-brand/5/60 ring-2 ring-brand/20" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {p.kind === "PER_VISIT"
                        ? `Pay as you come · valid ${p.validity_days} days`
                        : `${p.total_sessions} sessions · valid ${p.validity_days} days`}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-brand-deep">
                      {rupees(p.price)}
                      {p.kind === "PER_VISIT" && (
                        <span className="font-normal text-slate-400"> / visit</span>
                      )}
                    </p>
                  </button>
                ))}
              </div>
              {form.per_visit_rate > 0 && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand/5 px-3 py-2 text-xs text-brand-deep ring-1 ring-brand/20">
                  <CalendarCheck size={13} />
                  Daily basis &mdash; no subscription. The first visit is booked now and the card grows
                  each time they come, billed {rupees(form.per_visit_rate)} a visit.
                </p>
              )}
            </div>

            <div>
              <label className="label">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {PAY_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ payment_mode: m })}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold transition
                      ${form.payment_mode === m ? "border-brand bg-brand/5 text-brand-deep" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Paying now (leave it short for an instalment)</label>
              <div className="flex flex-wrap items-center gap-2">
                <NumberField
                  className="input w-40"
                  min={0}
                  value={form.advance_amount}
                  onChange={(n) => set({ advance_amount: Math.max(0, n) })}
                />
                {form.price > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost py-2 text-xs"
                      onClick={() => set({ advance_amount: form.price })}
                    >
                      Full {rupees(form.price)}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost py-2 text-xs"
                      onClick={() => set({ advance_amount: Math.round(form.price / 2) })}
                    >
                      Half
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn-ghost py-2 text-xs"
                  onClick={() => set({ advance_amount: 0 })}
                >
                  Nothing yet
                </button>
              </div>
              {form.price > 0 && form.advance_amount < form.price && (
                <p className="mt-2 text-xs text-amber-700">
                  {rupees(form.price - form.advance_amount)} will show as due on the admin console until
                  it is collected.
                </p>
              )}
            </div>

            <dl className="rounded-xl bg-slate-50 p-5 text-sm ring-1 ring-slate-200">
              <Row k="Patient" v={form.full_name} />
              <Row k="Login ID" v={form.phone_number} />
              <Row k="Category / Diagnosis" v={`${form.category} · ${form.diagnosis}`} />
              <Row
                k="Package"
                v={
                  form.per_visit_rate
                    ? `${form.package_name} (${rupees(form.per_visit_rate)} / visit)`
                    : `${form.package_name} (${form.total_sessions} sessions)`
                }
              />
              <Row k="Billed" v={form.per_visit_rate ? "Per visit attended" : rupees(form.price)} />
              <Row k="Paying now" v={`${rupees(form.advance_amount)} ${form.payment_mode}`} />
            </dl>
          </div>
        )}

        {error && (
          <p className="mt-5 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>
        )}

        <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => (step === 0 ? undefined : setStep(step - 1))}
            disabled={step === 0}
          >
            <ArrowLeft size={15} /> Back
          </button>
          {step < 2 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={step === 0 ? !step1Ok : !step2Ok}
              onClick={() => setStep(step + 1)}
            >
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={!form.package_name || create.isPending}
              onClick={() => {
                setError("");
                create.mutate();
              }}
            >
              {create.isPending ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
              Create Account
            </button>
          )}
        </div>
      </div>

    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-slate-200 py-2 last:border-0">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-semibold uppercase">{v || "—"}</dd>
    </div>
  );
}

function Done({ data }: { data: PatientPayload & { login_id: string; password: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="card p-8 text-center">
        <BadgeCheck size={44} className="mx-auto text-emerald-500" />
        <h1 className="mt-4 text-xl font-bold uppercase">{data.patient.full_name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Account created · {data.package?.package_name} · {data.sessions.length} sessions booked
        </p>

        <div className="mt-6 space-y-3 rounded-xl bg-slate-900 p-5 text-left">
          <Credential label="Login ID (Phone)" value={data.login_id} />
          <Credential label="Password" value={data.password} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Save these now — this code is shown once and stored hashed. Print this page or write it down for the patient.
        </p>

        <a
          href={waHref(
            data.login_id,
            `B-WELL Physiotherapy Clinic\nYour patient portal login\nLogin ID (phone): ${data.login_id}\nPassword: ${data.password}\n\nPlease keep this private.`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost mt-4 w-full"
        >
          <MessageCircle size={15} /> Send login on WhatsApp
        </a>

        <Link href="/login" className="btn-primary mt-6 w-full">
          Go to Patient Login <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="font-mono text-lg font-bold text-white">{value}</p>
      </div>
      <button
        onClick={() => navigator.clipboard?.writeText(value)}
        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        title="Copy"
      >
        <Copy size={15} />
      </button>
    </div>
  );
}
