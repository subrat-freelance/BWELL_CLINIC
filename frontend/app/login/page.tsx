"use client";

import { useMutation } from "@tanstack/react-query";
import { Activity, HelpCircle, Loader2, Lock, Phone } from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, apiError, type PatientPayload } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<PatientPayload & { access_token: string }>(
        "/auth/patient-login",
        { phone_number: phone, password },
      );
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem("bwell_token", data.access_token);
      router.push("/portal");
    },
    onError: (err) => setError(apiError(err, "Login failed")),
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <ClinicMark size={40} />
          <span className="font-bold tracking-tight">B-WELL PHYSIOTHERAPY CLINIC</span>
        </Link>

        <form
          className="card p-7"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            login.mutate();
          }}
        >
          <h1 className="text-lg font-bold">Patient Login</h1>
          <p className="mt-1 text-sm text-slate-500">Use the credentials issued at registration.</p>

          <div className="mt-6">
            <label className="label" htmlFor="phone">
              Phone Number (Login ID)
            </label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                id="phone"
                className="input pl-9 font-mono tracking-wider"
                inputMode="numeric"
                autoComplete="username"
                maxLength={10}
                placeholder="9348820192"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                required
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="label flex items-center gap-1.5" htmlFor="password">
              Password
              <span className="group relative">
                <HelpCircle size={13} className="cursor-help text-slate-400" />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                  The code printed on your registration slip.
                  <br />
                  Lost it? The clinic front desk can look it up.
                </span>
              </span>
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                id="password"
                className="input pl-9 font-mono tracking-wider uppercase"
                autoComplete="current-password"
                placeholder="8-character code"
                value={password}
                onChange={(e) => setPassword(e.target.value.toUpperCase())}
                required
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              This is the code printed on your registration slip.
            </p>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}

          <button className="btn-primary mt-6 w-full" disabled={login.isPending}>
            {login.isPending && <Loader2 size={16} className="animate-spin" />}
            Sign in to my portal
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            New patient? The front desk registers you at the clinic and hands you these
            details — there is nothing to fill in here first.
          </p>
        </form>
      </div>
    </main>
  );
}
