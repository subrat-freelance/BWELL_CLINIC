"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, MessageCircle, ShieldQuestion, Loader2 } from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { useState } from "react";
import { api, apiError } from "@/lib/api";
import { waHref } from "@/lib/clinic";

type Recovered = { username: string; password: string; phone: string | null };

export default function RecoverPage() {
  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  const recover = useMutation({
    mutationFn: async () =>
      (await api.post("/auth/recover", { username, recovery_key: key })).data as Recovered,
    onError: (err) => setError(apiError(err, "Recovery failed")),
  });

  const done = recover.data;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
        <ClinicMark size={44} />
        <span className="text-base font-bold tracking-tight">B-WELL · CLINIC</span>
      </Link>

      <div className="card p-8">
        {done ? (
          <>
            <div className="flex items-center gap-2 text-lg font-bold">
              <Check size={20} className="text-emerald-600" /> New password issued
            </div>
            <p className="mt-1 text-sm text-slate-500">
              For <span className="font-semibold">{done.username}</span>. Sign in with it, then
              change it to something you&rsquo;ll remember.
            </p>
            <div className="mt-5 rounded-xl bg-slate-900 p-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Password
              </p>
              <p className="select-all font-mono text-xl font-bold text-white">{done.password}</p>
            </div>
            {done.phone && (
              <a
                href={waHref(
                  done.phone,
                  `B-WELL admin login\nUsername: ${done.username}\nPassword: ${done.password}\n\nChange it after signing in.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost mt-4 w-full"
              >
                <MessageCircle size={15} /> Send to my WhatsApp
              </a>
            )}
            <Link href="/admin/login" className="btn-primary mt-3 w-full">
              Go to sign in <ArrowRight size={15} />
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-lg font-bold">
              <ShieldQuestion size={20} className="text-brand" /> Account recovery
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Locked out of an owner or staff account? Enter the username and the clinic&rsquo;s{" "}
              <span className="font-semibold">recovery key</span> (kept offline) to get a new
              password. If another owner can still sign in, ask them to reset it from Staff accounts
              instead.
            </p>

            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                if (username && key) recover.mutate();
              }}
            >
              <div>
                <label className="label" htmlFor="username">Username</label>
                <input
                  id="username"
                  className="input font-mono"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="key">Recovery key</label>
                <input
                  id="key"
                  className="input font-mono tracking-wider"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={!username || !key || recover.isPending}
              >
                {recover.isPending ? <Loader2 size={16} className="animate-spin" /> : "Reset my password"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              <Link href="/admin/login" className="font-semibold text-brand-deep hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
