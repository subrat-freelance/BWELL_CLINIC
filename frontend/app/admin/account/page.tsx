"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, apiError, currentStaff, type Staff } from "@/lib/api";

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Staff | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("bwell_staff_token")) router.replace("/admin/login");
    else setMe(currentStaff());
  }, [router]);

  const change = useMutation({
    mutationFn: async () =>
      (await api.post("/staff/change-password", { current_password: current, new_password: next })).data,
    onError: (err) => setError(apiError(err, "Could not change the password")),
  });

  const tooShort = next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current.length > 0 && !tooShort && next === confirm && !change.isPending;

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <ClinicMark size={38} />
            <span className="text-sm font-bold tracking-tight">B-WELL · ACCOUNT</span>
          </Link>
          <Link href="/admin" className="btn-ghost py-2 text-xs">
            <ArrowLeft size={14} /> Back to console
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-md px-6 py-10">
        <div className="card p-7">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <KeyRound size={18} className="text-brand" /> Change my password
          </h1>
          {me && (
            <p className="mt-1 text-sm text-slate-500">
              Signed in as <span className="font-semibold">{me.full_name}</span> ({me.username})
            </p>
          )}

          {change.isSuccess ? (
            <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
              <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <span>Password changed. Use the new one next time you sign in.</span>
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                if (canSubmit) change.mutate();
              }}
            >
              <div>
                <label className="label" htmlFor="current">Current password</label>
                <input
                  id="current"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="next">New password</label>
                <input
                  id="next"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                />
                {next.length > 0 && tooShort && (
                  <p className="mt-1 text-xs text-amber-700">At least 8 characters.</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="confirm">Confirm new password</label>
                <input
                  id="confirm"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                {mismatch && <p className="mt-1 text-xs text-amber-700">Passwords don&rsquo;t match.</p>}
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}

              <button type="submit" className="btn-primary w-full" disabled={!canSubmit}>
                {change.isPending ? <Loader2 size={15} className="animate-spin" /> : "Change password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
