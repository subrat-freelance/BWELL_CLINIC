"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleSlash,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api,
  apiError,
  currentStaff,
  isAuthError,
  KIND_LABEL,
  rupees,
  signOutStaff,
  useCatalogue,
  useClinic,
  type Clinic,
  type Staff,
  type CatalogueItem,
  type CatalogueKind,
} from "@/lib/api";
import NumberField from "@/lib/NumberField";

const TABS: { kind: CatalogueKind; blurb: string; columns: string[] }[] = [
  {
    kind: "PACKAGE",
    blurb: "Fixed courses of treatment. These are the cards a patient picks at registration.",
    columns: ["Name", "Price ₹", "Sessions", "Valid days"],
  },
  {
    kind: "PER_VISIT",
    blurb: "Daily-basis rates. No subscription — the case bills this rate for each visit attended.",
    columns: ["Name", "Rate ₹ / visit", "—", "Valid days"],
  },
  {
    kind: "ADDON",
    blurb: "Extra therapies the front desk can bill onto any case.",
    columns: ["Name", "Price ₹", "—", "—"],
  },
  {
    kind: "THERAPIST",
    blurb: "Names offered in the Attended By box on the session table.",
    columns: ["Name", "—", "—", "—"],
  },
  {
    kind: "CATEGORY",
    blurb:
      "Diagnosis categories offered at registration. The code, not the name, is what a " +
      "patient is filed under — rename a category freely, but changing its code orphans " +
      "the patients already on it.",
    columns: ["Name", "Code", "—", "—"],
  },
];

type Draft = Partial<CatalogueItem>;

export default function SettingsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  // Starts null on purpose: reading localStorage in the initialiser runs on the
  // server too, where it is empty, so the first client render would differ and
  // hydration would fail. The effect below fills it in after mount.
  const [me, setMe] = useState<Staff | null>(null);

  const [kind, setKind] = useState<CatalogueKind>("PACKAGE");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Rates are the owner's to set — the front desk never lands here.
  useEffect(() => {
    const who = currentStaff();
    setMe(who);
    if (!localStorage.getItem("bwell_staff_token")) router.replace("/admin/login");
    else if (who && who.role !== "OWNER") router.replace("/admin");
  }, [router]);

  const tab = TABS.find((t) => t.kind === kind)!;
  const list = useCatalogue(kind, true);
  const items = list.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["catalogue"] });
  const edit = (id: string, patch: Draft) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(drafts);
      for (const [id, patch] of entries) {
        await api.put(`/admin/catalogue/${id}`, patch);
      }
      return entries.length;
    },
    onSuccess: () => {
      setDrafts({});
      setError("");
      refresh();
    },
    onError: (err) => setError(apiError(err, "Could not save")),
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/admin/catalogue", {
          kind,
          name: `New ${KIND_LABEL[kind].one.toLowerCase()}`,
          // A category with no code cannot be filed against, so seed a free one.
          code:
            kind === "CATEGORY"
              ? (Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").find(
                  (letter) => !items.some((i) => i.code === letter),
                ) ?? "")
              : "",
          price: 0,
          total_sessions: kind === "PACKAGE" ? 10 : 0,
          validity_days: kind === "PACKAGE" ? 10 : 0,
          // Past the highest in use — counting rows collides with existing orders
          // and drops the new row into the middle of the list.
          sort_order: Math.max(0, ...items.map((i) => i.sort_order)) + 1,
        })
      ).data,
    onSuccess: refresh,
    onError: (err) => setError(apiError(err, "Could not add")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/catalogue/${id}`)).data,
    onSuccess: () => {
      setConfirming(null);
      refresh();
    },
    onError: (err) => setError(apiError(err, "Could not delete")),
  });

  useEffect(() => {
    if (isAuthError(list.error)) {
      signOutStaff();
      router.replace("/admin/login");
    }
  }, [list.error, router]);

  const dirty = Object.keys(drafts).length;
  const value = (item: CatalogueItem, field: keyof CatalogueItem) =>
    (drafts[item.id]?.[field] ?? item[field]) as string | number;

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <ClinicMark size={38} />
            <span className="text-sm font-bold tracking-tight">B-WELL · SETTINGS</span>
          </Link>
          <span className="flex items-center gap-2">
            <Link href="/admin/billing" className="btn-ghost py-2 text-xs">
              <Wallet size={14} /> Billing
            </Link>
            <Link href="/admin/staff" className="btn-ghost py-2 text-xs">
              <Users size={14} /> Staff
            </Link>
            <Link href="/admin" className="btn-ghost py-2 text-xs">
              <ArrowLeft size={14} /> Back to console
            </Link>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-lg font-bold">Rates &amp; Services</h1>
        {me && (
          <p className="mt-1 text-xs text-slate-400">
            Signed in as {me.full_name} · {me.role}
          </p>
        )}
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Everything the clinic charges for lives here. Change a price, add a therapy or retire a plan
          and the registration page, the New Case dialog and the billing boxes all follow — no developer,
          no deploy.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.kind}
              onClick={() => {
                setKind(t.kind);
                setDrafts({});
                setConfirming(null);
              }}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition
                ${kind === t.kind ? "border-brand bg-brand/5 text-brand-deep" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {KIND_LABEL[t.kind].many}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{tab.blurb}</p>

        <div className="card mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                {tab.columns.map((c, i) => (
                  <th key={c + i} className={`px-4 py-3 font-semibold ${i === 0 ? "w-1/2" : ""}`}>
                    {c}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-semibold">Live</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isPending && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className={item.is_active ? "" : "bg-slate-50/60 text-slate-400"}>
                  <td className="px-4 py-2">
                    <input
                      className="input px-2 py-1.5 text-xs"
                      value={value(item, "name")}
                      onChange={(e) => edit(item.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {kind === "CATEGORY" ? (
                      <input
                        className="input w-20 px-2 py-1.5 text-center text-xs font-bold uppercase"
                        maxLength={2}
                        value={String(value(item, "code") ?? "")}
                        onChange={(e) =>
                          edit(item.id, {
                            code: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 2),
                          })
                        }
                      />
                    ) : kind === "THERAPIST" ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <NumberField
                        className="input px-2 py-1.5 text-xs"
                        min={0}
                        value={Number(value(item, "price"))}
                        onChange={(n) => edit(item.id, { price: n })}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {kind === "PACKAGE" ? (
                      <NumberField
                        className="input px-2 py-1.5 text-xs"
                        min={1}
                        max={100}
                        value={Number(value(item, "total_sessions"))}
                        onChange={(n) => edit(item.id, { total_sessions: n })}
                      />
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {kind === "PACKAGE" || kind === "PER_VISIT" ? (
                      <NumberField
                        className="input px-2 py-1.5 text-xs"
                        min={0}
                        max={365}
                        value={Number(value(item, "validity_days"))}
                        onChange={(n) => edit(item.id, { validity_days: n })}
                      />
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand"
                      checked={Boolean(drafts[item.id]?.is_active ?? item.is_active)}
                      onChange={(e) => edit(item.id, { is_active: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {confirming === item.id ? (
                      <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <button
                          onClick={() => remove.mutate(item.id)}
                          disabled={remove.isPending}
                          className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          {remove.isPending ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="px-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        title="Delete permanently"
                        onClick={() => setConfirming(item.id)}
                        className="text-slate-300 transition hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!list.isPending && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-slate-400">
                    Nothing here yet — add the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3">
            <button className="btn-ghost py-2 text-xs" onClick={() => create.mutate()}>
              <Plus size={14} /> Add {KIND_LABEL[kind].one.toLowerCase()}
            </button>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <CircleSlash size={12} /> Unticking <span className="font-semibold">Live</span> hides it
              from the pickers; cases already booked keep their own price.
            </span>
            {confirming && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700">
                <TriangleAlert size={12} />
                Delete &ldquo;{items.find((i) => i.id === confirming)?.name}&rdquo; for good? Untick
                Live instead to retire it.
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {dirty > 0 && (
                <button className="btn-ghost py-2 text-xs" onClick={() => setDrafts({})}>
                  <RotateCcw size={13} /> Discard
                </button>
              )}
              <button
                className="btn-primary py-2 text-xs"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                {dirty ? `Save ${dirty} change${dirty === 1 ? "" : "s"}` : "Saved"}
              </button>
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}

        {kind === "CATEGORY" && items.length > 0 && (
          <p className="mt-4 text-xs text-slate-400">
            Offered at registration right now:{" "}
            {items
              .filter((i) => i.is_active)
              .map((i) => `${i.code} · ${i.name}`)
              .join(" · ")}
          </p>
        )}
        {kind !== "THERAPIST" && kind !== "CATEGORY" && items.length > 0 && (
          <p className="mt-4 text-xs text-slate-400">
            Live prices right now:{" "}
            {items
              .filter((i) => i.is_active)
              .map((i) => `${i.name} ${rupees(i.price)}`)
              .join(" · ")}
          </p>
        )}

        <Letterhead />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------ letterhead */
const LETTERHEAD: { key: keyof Clinic; label: string; hint?: string; wide?: boolean }[] = [
  { key: "name", label: "Clinic name", wide: true },
  { key: "tagline", label: "Tagline", wide: true },
  { key: "address", label: "Address", wide: true, hint: "Printed as typed — line breaks are kept" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "registration_no", label: "Clinical establishment reg. no." },
  { key: "gstin", label: "GSTIN", hint: "Leave blank if the clinic is not registered" },
  { key: "physio_name", label: "Physiotherapist (signs reports)" },
  { key: "physio_qualification", label: "Qualification" },
  { key: "physio_reg_no", label: "Physiotherapy council reg. no." },
  { key: "uhid_prefix", label: "UHID prefix", hint: "New patients only — issued numbers keep theirs" },
  { key: "receipt_prefix", label: "Receipt prefix" },
];

/**
 * What goes on top of every receipt, bill and treatment record. A printed clinical
 * document without the establishment's name and registration is not a document, so
 * this is the one screen that has to be filled in before the clinic opens.
 */
function Letterhead() {
  const qc = useQueryClient();
  const clinic = useClinic();
  const [draft, setDraft] = useState<Partial<Clinic>>({});
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: async () => (await api.put<Clinic>("/admin/clinic", draft)).data,
    onSuccess: () => {
      setDraft({});
      setNote("");
      qc.invalidateQueries({ queryKey: ["clinic"] });
    },
    onError: (err) => setNote(apiError(err, "Could not save the letterhead")),
  });

  if (!clinic.data) return null;
  const saved = clinic.data;
  const at = (key: keyof Clinic) => String(draft[key] ?? saved[key] ?? "");
  const dirty = Object.keys(draft).length;

  return (
    <section className="card mt-10 overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <FileText size={15} className="text-slate-400" /> Letterhead &amp; document identity
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Printed at the top of every receipt, bill and treatment record. Registration numbers matter
          — a clinical document without them is not accepted for insurance or reimbursement.
        </p>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {LETTERHEAD.map((f) => (
          <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
            <span className="label">{f.label}</span>
            {f.key === "address" ? (
              <textarea
                rows={2}
                className="input py-2 text-xs"
                value={at(f.key)}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
            ) : (
              <input
                className="input py-2 text-xs"
                value={at(f.key)}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
            )}
            {f.hint && <span className="mt-1 block text-[11px] text-slate-400">{f.hint}</span>}
          </label>
        ))}

        <label className="sm:col-span-2">
          <span className="label">Footer note on bills</span>
          <textarea
            rows={2}
            className="input py-2 text-xs"
            value={at("footer_note")}
            onChange={(e) => setDraft({ ...draft, footer_note: e.target.value })}
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Healthcare by a clinical establishment is GST-exempt, so what you issue is a bill of
            supply. Have your accountant confirm this wording.
          </span>
        </label>

        <label>
          <span className="label">Last receipt number issued</span>
          <NumberField
            className="input py-2 text-xs"
            min={saved.receipt_seq}
            value={Number(draft.receipt_seq ?? saved.receipt_seq)}
            onChange={(n) => setDraft({ ...draft, receipt_seq: n })}
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Next receipt will be {saved.receipt_prefix}-
            {String(Number(draft.receipt_seq ?? saved.receipt_seq) + 1).padStart(5, "0")}. Move it
            forward to carry on from a paper book; it can never go back.
          </span>
        </label>
        <p className="self-end pb-1 text-[11px] text-slate-400">
          {saved.uhid_seq} patient number{saved.uhid_seq === 1 ? "" : "s"} issued so far.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
        {note && <span className="text-xs font-semibold text-rose-700">{note}</span>}
        <span className="ml-auto flex items-center gap-2">
          {dirty > 0 && (
            <button className="btn-ghost py-2 text-xs" onClick={() => setDraft({})}>
              <RotateCcw size={13} /> Discard
            </button>
          )}
          <button
            className="btn-primary py-2 text-xs"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {dirty ? "Save letterhead" : "Saved"}
          </button>
        </span>
      </div>
    </section>
  );
}
