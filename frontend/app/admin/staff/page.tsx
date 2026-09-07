"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import ClinicMark from "@/lib/ClinicMark";
import { waHref } from "@/lib/clinic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, apiError, currentStaff, isAuthError, signOutStaff, utcStamp, type Staff } from "@/lib/api";

// No 0/O/1/I/L/U — a code read off a screen or a WhatsApp message shouldn't be misread.
const PW_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function randomPassword(len = 10) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => PW_ALPHABET[n % PW_ALPHABET.length]).join("");
}

/** The message an owner sends a staff member with their console login. */
const loginMessage = (username: string, password: string) =>
  `B-WELL Physiotherapy Clinic — staff console login\nUsername: ${username}\nPassword: ${password}\n\nPlease change it after signing in.`;

export default function StaffPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [me, setMe] = useState<Staff | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ username: "", full_name: "", password: "", role: "STAFF", phone: "" });
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [justSet, setJustSet] = useState<{ username: string; phone: string; password: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const who = currentStaff();
    setMe(who);
    if (!localStorage.getItem("bwell_staff_token")) router.replace("/admin/login");
    else if (who && who.role !== "OWNER") router.replace("/admin");
  }, [router]);

  const list = useQuery({
    queryKey: ["staff"],
    queryFn: async () => (await api.get<Staff[]>("/admin/staff")).data,
  });
  const staff = list.data ?? [];

  useEffect(() => {
    if (isAuthError(list.error)) {
      signOutStaff();
      router.replace("/admin/login");
    }
  }, [list.error, router]);

  const refresh = () => {
    setError("");
    qc.invalidateQueries({ queryKey: ["staff"] });
  };
  const fail = (m: string) => (err: unknown) => setError(apiError(err, m));

  const create = useMutation({
    mutationFn: async () => (await api.post("/admin/staff", draft)).data,
    onSuccess: () => {
      setJustSet({ username: draft.username, phone: draft.phone, password: draft.password });
      setAdding(false);
      setDraft({ username: "", full_name: "", password: "", role: "STAFF", phone: "" });
      refresh();
    },
    onError: fail("Could not create the account"),
  });

  // Everything except the password: role, active, WhatsApp number, self-service flag.
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Staff>) =>
      (await api.put(`/admin/staff/${id}`, patch)).data,
    onSuccess: refresh,
    onError: fail("Could not update the account"),
  });

  // Setting a password is its own action so it can surface the credential to send.
  const resetPw = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) =>
      (await api.put(`/admin/staff/${id}`, { password })).data,
    onSuccess: (_data, vars) => {
      const s = staff.find((x) => x.id === vars.id);
      setJustSet({ username: s?.username ?? "", phone: s?.phone ?? "", password: vars.password });
      setResetting(null);
      setNewPassword("");
      refresh();
    },
    onError: fail("Could not update the account"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/staff/${id}`)).data,
    onSuccess: () => {
      setConfirming(null);
      refresh();
    },
    onError: fail("Could not delete the account"),
  });

  const savePhone = (s: Staff, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 10);
    if (v !== (s.phone ?? "")) update.mutate({ id: s.id, phone: v });
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <ClinicMark size={38} />
            <span className="text-sm font-bold tracking-tight">B-WELL · STAFF</span>
          </Link>
          <Link href="/admin" className="btn-ghost py-2 text-xs">
            <ArrowLeft size={14} /> Back to console
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-lg font-bold">Staff accounts</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Everyone signs in as themselves, so receipts carry the name of whoever took the money.
          An <span className="font-semibold">owner</span> can change rates and manage these accounts;{" "}
          <span className="font-semibold">staff</span> run the day to day. Save a WhatsApp number to
          send a login, and tick <span className="font-semibold">own password</span> to let a staff
          member change theirs.
        </p>

        {justSet && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <span>
              Password set for <span className="font-mono font-semibold">{justSet.username}</span>:{" "}
              <span className="select-all font-mono font-bold">{justSet.password}</span>
            </span>
            {justSet.phone ? (
              <a
                className="btn-primary py-1.5 text-xs"
                target="_blank"
                rel="noopener noreferrer"
                href={waHref(justSet.phone, loginMessage(justSet.username, justSet.password))}
              >
                <MessageCircle size={14} /> Send on WhatsApp
              </a>
            ) : (
              <span className="text-xs text-emerald-700">
                No WhatsApp number on file — add one in the row to send it.
              </span>
            )}
            <button
              className="ml-auto text-xs font-semibold text-emerald-700 hover:underline"
              onClick={() => setJustSet(null)}
            >
              Done
            </button>
          </div>
        )}

        <div className="card mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Username</th>
                <th className="px-4 py-3 font-semibold">WhatsApp</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Last signed in</th>
                <th className="px-4 py-3 text-center font-semibold">Active</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isPending && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className={s.is_active ? "" : "bg-slate-50/60 text-slate-400"}>
                  <td className="px-4 py-2.5 font-semibold uppercase">
                    {s.full_name}
                    {s.id === me?.id && <span className="ml-1.5 text-[10px] text-slate-400">(you)</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s.username}</td>
                  <td className="px-4 py-2.5">
                    <input
                      className="input w-32 px-2 py-1 font-mono text-xs"
                      defaultValue={s.phone ?? ""}
                      placeholder="10-digit"
                      inputMode="numeric"
                      maxLength={10}
                      onBlur={(e) => savePhone(s, e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="input w-28 px-2 py-1 text-xs"
                      value={s.role}
                      onChange={(e) => update.mutate({ id: s.id, role: e.target.value as Staff["role"] })}
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="STAFF">STAFF</option>
                    </select>
                    {s.role !== "OWNER" && (
                      <label className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                        <input
                          type="checkbox"
                          className="h-3 w-3 accent-brand"
                          checked={s.can_change_password}
                          onChange={(e) => update.mutate({ id: s.id, can_change_password: e.target.checked })}
                        />
                        can set own password
                      </label>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {s.last_login_at ? utcStamp(s.last_login_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "never"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand"
                      checked={s.is_active}
                      onChange={(e) => update.mutate({ id: s.id, is_active: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-right align-top">
                    {confirming === s.id ? (
                      <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <button
                          onClick={() => remove.mutate(s.id)}
                          className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="px-1 text-[11px] font-semibold text-slate-500"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-2">
                        <button
                          title="Set a new password"
                          onClick={() => {
                            setResetting(resetting === s.id ? null : s.id);
                            setNewPassword("");
                            setJustSet(null);
                          }}
                          className="text-slate-400 transition hover:text-brand-deep"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          title="Delete this account"
                          onClick={() => setConfirming(s.id)}
                          className="text-slate-300 transition hover:text-rose-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {resetting && (
                <tr className="bg-brand/5">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-48 flex-1">
                        <span className="label">
                          New password for {staff.find((s) => s.id === resetting)?.full_name}
                        </span>
                        <div className="flex gap-1.5">
                          <input
                            className="input bg-white px-2 py-1.5 font-mono text-xs"
                            type="text"
                            value={newPassword}
                            placeholder="at least 8 characters"
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-ghost whitespace-nowrap px-2.5 py-1.5 text-[11px]"
                            onClick={() => setNewPassword(randomPassword())}
                          >
                            Generate
                          </button>
                        </div>
                      </label>
                      <button
                        className="btn-primary px-3 py-1.5 text-xs"
                        disabled={newPassword.length < 8 || resetPw.isPending}
                        onClick={() => resetPw.mutate({ id: resetting, password: newPassword })}
                      >
                        {resetPw.isPending ? <Loader2 size={12} className="animate-spin" /> : "Set password"}
                      </button>
                      <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setResetting(null)}>
                        Cancel
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      The account&rsquo;s saved WhatsApp number is used to send it, if one is set.
                    </p>
                  </td>
                </tr>
              )}

              {adding && (
                <tr className="bg-slate-50">
                  <td className="px-4 py-2.5 align-top">
                    <input
                      className="input px-2 py-1.5 text-xs uppercase"
                      placeholder="Full name"
                      value={draft.full_name}
                      onChange={(e) => setDraft({ ...draft, full_name: e.target.value.toUpperCase() })}
                    />
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <input
                      className="input px-2 py-1.5 font-mono text-xs"
                      placeholder="username"
                      value={draft.username}
                      onChange={(e) => setDraft({ ...draft, username: e.target.value.toLowerCase() })}
                    />
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <input
                      className="input w-32 px-2 py-1.5 font-mono text-xs"
                      placeholder="WhatsApp"
                      inputMode="numeric"
                      maxLength={10}
                      value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    />
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <select
                      className="input w-28 px-2 py-1 text-xs"
                      value={draft.role}
                      onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    >
                      <option value="STAFF">STAFF</option>
                      <option value="OWNER">OWNER</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 align-top" colSpan={2}>
                    <div className="flex gap-1.5">
                      <input
                        className="input px-2 py-1.5 text-xs"
                        placeholder="password (min 8)"
                        value={draft.password}
                        onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn-ghost whitespace-nowrap px-2.5 py-1.5 text-[11px]"
                        onClick={() => setDraft({ ...draft, password: randomPassword() })}
                      >
                        Generate
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right align-top">
                    <button
                      className="btn-primary px-2.5 py-1 text-[11px]"
                      disabled={create.isPending || draft.password.length < 8 || !draft.username}
                      onClick={() => create.mutate()}
                    >
                      {create.isPending ? <Loader2 size={12} className="animate-spin" /> : "Create"}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3">
            <button className="btn-ghost py-2 text-xs" onClick={() => setAdding(!adding)}>
              <Plus size={14} /> {adding ? "Cancel" : "Add staff member"}
            </button>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <TriangleAlert size={12} /> Unticking <span className="font-semibold">Active</span> signs
              them out immediately and keeps their history. Delete only removes an account created in
              error.
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
