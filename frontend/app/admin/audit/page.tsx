"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, currentStaff, isAuthError, signOutStaff, utcStamp, type AuditEntry } from "@/lib/api";

// Colour by the object that was touched, so the eye can scan the log by kind.
const TONE: Record<string, string> = {
  login: "bg-slate-100 text-slate-600",
  password: "bg-rose-100 text-rose-700",
  staff: "bg-violet-100 text-violet-700",
  patient: "bg-brand/10 text-brand-deep",
  payment: "bg-emerald-100 text-emerald-700",
  clinic: "bg-amber-100 text-amber-800",
  catalogue: "bg-amber-100 text-amber-800",
  inquiry: "bg-sky-100 text-sky-700",
};
const toneFor = (action: string) => TONE[action.split(".")[0]] ?? "bg-slate-100 text-slate-600";

export default function AuditPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const who = currentStaff();
    if (!localStorage.getItem("bwell_staff_token")) router.replace("/admin/login");
    else if (who && who.role !== "OWNER") router.replace("/admin");
  }, [router]);

  const log = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await api.get<AuditEntry[]>("/admin/audit")).data,
  });

  useEffect(() => {
    if (isAuthError(log.error)) {
      signOutStaff();
      router.replace("/admin/login");
    }
  }, [log.error, router]);

  const rows = log.data ?? [];
  const actions = Array.from(new Set(rows.map((r) => r.action))).sort();
  const shown = filter ? rows.filter((r) => r.action === filter) : rows;

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <ClinicMark size={38} />
            <span className="text-sm font-bold tracking-tight">B-WELL · ACTIVITY</span>
          </Link>
          <Link href="/admin" className="btn-ghost py-2 text-xs">
            <ArrowLeft size={14} /> Back to console
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold">
              <ScrollText size={18} className="text-brand" /> Activity log
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Who did what — the most recent {rows.length} actions. Accounts, passwords, patients,
              money, settings and sign-ins are recorded.
            </p>
          </div>
          {actions.length > 0 && (
            <select
              className="input w-52 py-2 text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="card mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.isPending && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!log.isPending && shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-slate-400">
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                    {utcStamp(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td className="px-4 py-2.5 font-semibold uppercase">{e.actor_name || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${toneFor(e.action)}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {e.summary}
                    {e.target && <span className="ml-1.5 font-mono text-xs text-slate-400">[{e.target}]</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
