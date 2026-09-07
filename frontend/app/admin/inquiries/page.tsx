"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Inbox,
  Phone,
  MessageCircle,
  CalendarClock,
  Check,
  Loader2,
} from "lucide-react";
import {
  api,
  apiError,
  isAuthError,
  signOutStaff,
  useInquiries,
  utcStamp,
  INQUIRY_LABEL,
  INQUIRY_STATUS,
  type Inquiry,
  type InquiryStatus,
} from "@/lib/api";

/**
 * The callback list. Every row is a person who asked to be seen and has not been
 * rung back yet, so the only thing this screen has to do well is make "who is still
 * waiting" obvious and make marking one done a single click.
 *
 * Staff-wide on purpose — ringing people back is the front desk's job, not the
 * owner's, so this is not behind the owner gate that Billing and Rates sit behind.
 */

const FILTERS = [
  { id: undefined as InquiryStatus | undefined, label: "All" },
  ...INQUIRY_STATUS.map((s) => ({ id: s as InquiryStatus | undefined, label: INQUIRY_LABEL[s].text })),
];

/** "2 hours ago" beats a timestamp when the question is "how long have they waited". */
function waited(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - utcStamp(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function InquiriesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InquiryStatus | undefined>(undefined);
  const [error, setError] = useState("");

  const board = useInquiries(filter);

  const work = useMutation({
    mutationFn: async (vars: { id: string; status?: InquiryStatus; note?: string }) =>
      (await api.patch<Inquiry>(`/admin/inquiries/${vars.id}`, {
        status: vars.status,
        note: vars.note,
      })).data,
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
    },
    onError: (err) => {
      if (isAuthError(err)) {
        signOutStaff();
        router.replace("/admin/login");
        return;
      }
      setError(apiError(err, "Could not update that inquiry"));
    },
  });

  const rows = board.data?.inquiries ?? [];
  const counts = board.data?.counts;

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft size={16} /> Back to the queue
          </Link>
          <span className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Inbox size={16} className="text-brand" />
            Appointment inquiries
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-slate-600">
          Requests sent from the clinic&rsquo;s public site. Nothing here is a booking —
          each one is someone waiting for a call back.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === f.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
              {f.id && counts ? (
                <span className="ml-1.5 text-[11px] opacity-70">{counts[f.id]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}

        {board.isLoading ? (
          <p className="mt-10 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" /> Loading inquiries…
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
            Nothing here. Requests from the public site land on this board.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-slate-900">{row.full_name}</h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${INQUIRY_LABEL[row.status].chip}`}
                      >
                        {INQUIRY_LABEL[row.status].text}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Asked {waited(row.created_at)} ·{" "}
                      {utcStamp(row.created_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:+91${row.phone_number}`}
                      className="btn-ghost py-2 text-xs"
                      title={`Call ${row.phone_number}`}
                    >
                      <Phone size={14} /> {row.phone_number}
                    </a>
                    <a
                      href={`https://wa.me/91${row.phone_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost py-2 text-xs"
                      title="Message on WhatsApp"
                      aria-label={`Message ${row.full_name} on WhatsApp`}
                    >
                      <MessageCircle size={14} />
                    </a>
                  </div>
                </div>

{(() => {
                  const details = (
                    [
                      ["Wants", row.reason],
                      ["Physiotherapist", row.preferred_physio],
                      [
                        "Preferred time",
                        [row.preferred_date, row.preferred_slot].filter(Boolean).join(" · ") || null,
                      ],
                      ["Told us", row.symptoms],
                    ] as const
                  ).filter(([, value]) => value);
                  // Someone who filled in nothing but a name and number gets no empty block.
                  if (details.length === 0) return null;
                  return (
                    <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs sm:grid-cols-2">
                      {details.map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <dt className="shrink-0 font-semibold uppercase tracking-wide text-slate-400">
                            {key}
                          </dt>
                          <dd className="text-slate-700">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  );
                })()}

                {row.note && (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <CalendarClock size={12} className="mr-1 inline text-slate-400" />
                    {row.note}
                    {row.handled_by && (
                      <span className="ml-1 text-slate-400">— {row.handled_by}</span>
                    )}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  {INQUIRY_STATUS.filter((s) => s !== row.status).map((s) => (
                    <button
                      key={s}
                      disabled={work.isPending}
                      onClick={() => work.mutate({ id: row.id, status: s })}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-50"
                    >
                      <Check size={11} className="mr-1 inline" />
                      {INQUIRY_LABEL[s].text}
                    </button>
                  ))}
                  <NoteBox
                    disabled={work.isPending}
                    onSave={(note) => work.mutate({ id: row.id, note })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/** A one-line "what happened when we rang" box, collapsed until it is wanted. */
function NoteBox({ disabled, onSave }: { disabled: boolean; onSave: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-brand-deep hover:text-brand-deep"
      >
        Add a note
      </button>
    );
  }
  return (
    <form
      className="flex flex-1 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSave(text.trim());
        setText("");
        setOpen(false);
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Rang back — booking Tuesday morning"
        className="input py-1.5 text-xs"
      />
      <button type="submit" disabled={disabled} className="btn-primary py-1.5 text-xs">
        Save
      </button>
    </form>
  );
}
