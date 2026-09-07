"use client";

import { useMutation } from "@tanstack/react-query";
import { Activity, Loader2, Lock, User } from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, apiError, saveStaffToken, type Staff } from "@/lib/api";

export default function StaffLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ access_token: string; staff: Staff }>("/auth/staff-login", {
          username,
          password,
        })
      ).data,
    onSuccess: (data) => {
      saveStaffToken(data.access_token, data.staff);
      router.replace("/admin");
    },
    onError: (err) => setError(apiError(err, "Sign in failed")),
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
          <h1 className="text-lg font-bold">Staff Sign In</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use your own account — the clinic console is no longer a shared password.
          </p>

          <div className="mt-6">
            <label className="label" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                id="username"
                className="input pl-9"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                id="password"
                type="password"
                className="input pl-9"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}

          <button className="btn-primary mt-6 w-full" disabled={login.isPending}>
            {login.isPending && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            Patient?{" "}
            <Link href="/login" className="font-semibold text-brand-deep hover:underline">
              Sign in here
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-slate-400">
            Locked out?{" "}
            <Link href="/recover" className="font-semibold text-slate-500 hover:underline">
              Account recovery
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
