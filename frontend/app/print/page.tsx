"use client";

/**
 * Every printable document the clinic issues, behind one route.
 *
 *   /print?doc=receipt&patient=<id>&package=<id>&receipt=<payment id>
 *   /print?doc=bill&patient=<id>&package=<id>
 *   /print?doc=record&patient=<id>&package=<id>
 *   /print?doc=prescription&patient=<id>&package=<id>
 *   /print?doc=daybook&from=<date>&to=<date>
 *
 * Staff only. Documents are issued at the counter, not printed by patients from the
 * portal, so every one of them reads the admin endpoint. The collection report is
 * money on top of that, so it is owner-only and comes from the billing endpoint.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  api,
  amountInWords,
  apiError,
  isAuthError,
  longDate,
  roadmapFor,
  rupees,
  shortDate,
  useClinic,
  type BillingReport,
  type Clinic,
  type PatientPayload,
} from "@/lib/api";
import {
  DocFooter,
  DocTitle,
  Letterhead,
  PatientBlock,
  RuledLines,
  Watermark,
  Signatures,
  signedBy,
} from "@/lib/print";

export default function PrintPage() {
  return (
    <Suspense fallback={<Centre>Loading…</Centre>}>
      <Document />
    </Suspense>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="flex h-64 items-center justify-center text-sm text-slate-500">{children}</div>;
}

function Document() {
  const params = useSearchParams();
  const doc = params.get("doc") ?? "record";
  const patientId = params.get("patient");
  const packageId = params.get("package");
  const receiptId = params.get("receipt");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const clinic = useClinic();

  const care = useQuery({
    queryKey: ["print-care", patientId, packageId],
    queryFn: async () =>
      (
        await api.get<PatientPayload>(`/admin/patients/${patientId}`, {
          params: { package_id: packageId },
        })
      ).data,
    enabled: doc !== "daybook" && !!patientId,
  });

  const money = useQuery({
    queryKey: ["print-daybook", from, to],
    queryFn: async () =>
      (
        await api.get<BillingReport>("/admin/billing", {
          params: { from: from || undefined, to: to || undefined },
        })
      ).data,
    enabled: doc === "daybook",
  });

  // isLoading, not isPending: a disabled query stays "pending" for ever, so the
  // unused half of this page would spin a loader above the finished document.
  const pending = clinic.isLoading || care.isLoading || money.isLoading;
  const failed = clinic.error ?? care.error ?? money.error;

  return (
    <main className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Link href="/admin" className="btn-ghost py-2 text-xs">
          <ArrowLeft size={14} /> Back to console
        </Link>
        <button className="btn-primary py-2 text-xs" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </button>
      </div>

      {doc === "prescription" && clinic.data && !clinic.data.physio_reg_no && (
        <p className="no-print mx-auto mb-4 max-w-[210mm] border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <strong>No physiotherapist registration number on the letterhead.</strong> A
          prescription is the one document that leaves the clinic, and a referring doctor or
          insurer will look for the prescriber&rsquo;s council registration. Add it under{" "}
          <Link href="/admin/settings" className="font-semibold underline">
            Settings &rarr; Letterhead
          </Link>{" "}
          before issuing this.
        </p>
      )}

      <div className="doc shadow-sm print:shadow-none">
        {pending && (
          <Centre>
            <Loader2 className="animate-spin" />
          </Centre>
        )}
        {failed && (
          <Centre>
            {isAuthError(failed) ? (
              // Sessions expire, and a print link is exactly what gets opened hours later.
              <span>
                Your session has expired.{" "}
                <Link href="/admin/login" className="font-semibold text-brand-deep underline">
                  Sign in again
                </Link>{" "}
                and reopen this document.
              </span>
            ) : (
              apiError(failed, "This document could not be loaded")
            )}
          </Centre>
        )}
        {clinic.data && care.data && doc === "receipt" && (
          <Receipt clinic={clinic.data} data={care.data} receiptId={receiptId} />
        )}
        {clinic.data && care.data && doc === "bill" && <Bill clinic={clinic.data} data={care.data} />}
        {clinic.data && care.data && doc === "record" && (
          <Record clinic={clinic.data} data={care.data} />
        )}
        {clinic.data && care.data && doc === "prescription" && (
          <Prescription clinic={clinic.data} data={care.data} />
        )}
        {clinic.data && money.data && doc === "daybook" && (
          <Daybook clinic={clinic.data} report={money.data} />
        )}
        {!pending && !failed && !care.data && !money.data && (
          // A hand-edited or truncated link lands here — say so rather than
          // printing an empty sheet of letterhead.
          <Centre>
            This link does not name a document. Open it from the printer icon in the console.
          </Centre>
        )}
      </div>
    </main>
  );
}

/** A patient's packages are newest-first, so case 1 is the last one in the list. */
const caseNumber = (data: PatientPayload) => {
  const index = data.packages.findIndex((p) => p.id === data.package?.id);
  return index < 0 ? 1 : data.packages.length - index;
};

/* --------------------------------------------------------------- receipt */
function Receipt({
  clinic,
  data,
  receiptId,
}: {
  clinic: Clinic;
  data: PatientPayload;
  receiptId: string | null;
}) {
  // Default to the latest receipt, which is what the front desk wants right after
  // taking money — the page is opened straight from the Take payment button.
  const receipt = data.payments.find((p) => p.id === receiptId) ?? data.payments.at(-1);
  if (!receipt) return <Centre>No receipt on this case yet.</Centre>;

  const refund = receipt.amount < 0;
  const taken = data.payments
    .filter((p) => p.paid_on <= receipt.paid_on)
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <>
      <Watermark />
      <Letterhead clinic={clinic} />
      <DocTitle
        title={refund ? "Refund Voucher" : "Payment Receipt"}
        meta={[
          ["No.", receipt.receipt_no ?? "—"],
          ["Date", longDate(receipt.paid_on)],
        ]}
      />
      <PatientBlock
        patient={data.patient}
        extra={[
          ["Treatment", data.package?.package_name ?? "—"],
          ["Case No.", String(caseNumber(data))],
        ]}
      />

      <p className="text-[10.5pt] leading-relaxed">
        {refund ? "Refunded to" : "Received with thanks from"}{" "}
        <span className="font-bold uppercase">{data.patient.full_name}</span> the sum of{" "}
        <span className="font-bold">{rupees(Math.abs(receipt.amount))}</span> by{" "}
        <span className="font-semibold">{receipt.mode}</span>
        {receipt.reference && <> (Ref. {receipt.reference})</>} towards{" "}
        {data.package?.package_name ?? "treatment"}.
      </p>
      <p className="mt-2 border-y border-slate-300 py-2 text-[10pt] font-semibold uppercase">
        {amountInWords(Math.abs(receipt.amount))}
      </p>

      <table className="doc-table mt-5">
        <tbody>
          <tr>
            <td className="doc-key">Total billed for this case</td>
            <td className="text-right font-semibold">{rupees(data.billed)}</td>
          </tr>
          <tr>
            <td className="doc-key">Received up to this receipt</td>
            <td className="text-right font-semibold">{rupees(taken)}</td>
          </tr>
          <tr>
            <td className="doc-key">Balance outstanding</td>
            <td className="text-right text-[12pt] font-bold">{rupees(data.billed - taken)}</td>
          </tr>
        </tbody>
      </table>

      {receipt.note && <p className="mt-3 text-[9pt] text-slate-600">Note: {receipt.note}</p>}

      <Signatures roles={[`Received by${receipt.recorded_by ? ` — ${receipt.recorded_by}` : ""}`, `For ${clinic.name}`]} />
      <DocFooter
        clinic={clinic}
        fiscal
        note="Please retain this receipt. It is required for any claim, reimbursement or refund."
      />
    </>
  );
}

/* ------------------------------------------------------------------ bill */
function Bill({ clinic, data }: { clinic: Clinic; data: PatientPayload }) {
  const pkg = data.package;
  if (!pkg) return <Centre>This patient has no case to bill.</Centre>;

  const base = pkg.per_visit_rate
    ? {
        description: `${pkg.package_name} — treatment sessions attended`,
        quantity: data.completed_sessions,
        rate: pkg.per_visit_rate,
      }
    : {
        description: `${pkg.package_name} — course of ${pkg.total_sessions} sessions`,
        quantity: 1,
        rate: pkg.price,
      };
  const lines = [
    base,
    ...data.charges.map((c) => ({
      description: c.description,
      quantity: c.quantity,
      rate: c.amount,
    })),
  ];

  return (
    <>
      <Watermark />
      <Letterhead clinic={clinic} />
      <DocTitle
        title="Bill of Supply"
        meta={[
          ["Bill No.", `${data.patient.uhid ?? "—"}/${caseNumber(data)}`],
          ["Date", longDate(new Date().toISOString())],
          ["Treatment Period", `${shortDate(pkg.start_date)} – ${shortDate(pkg.end_date)}`],
        ]}
      />
      <PatientBlock
        patient={data.patient}
        extra={[
          ["Referred By", data.patient.referring_doctor ?? "—"],
          ["Diagnosis", data.patient.diagnosis ?? "—"],
        ]}
      />

      <table className="doc-table">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Particulars</th>
            <th className="w-16 text-right">Qty</th>
            <th className="w-24 text-right">Rate</th>
            <th className="w-28 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{line.description}</td>
              <td className="text-right tabular-nums">{line.quantity}</td>
              <td className="text-right tabular-nums">{rupees(line.rate)}</td>
              <td className="text-right font-semibold tabular-nums">
                {rupees(line.quantity * line.rate)}
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="text-right font-bold uppercase">
              Total billed
            </td>
            <td className="text-right text-[11pt] font-bold tabular-nums">{rupees(data.billed)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-2 border-y border-slate-300 py-2 text-[10pt] font-semibold uppercase">
        {amountInWords(data.billed)}
      </p>

      <h3 className="mt-6 text-[10pt] font-bold uppercase tracking-wide">Payments received</h3>
      <table className="doc-table mt-1">
        <thead>
          <tr>
            <th className="w-32">Receipt No.</th>
            <th className="w-28">Date</th>
            <th className="w-24">Mode</th>
            <th>Reference</th>
            <th className="w-28 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.payments.length === 0 && (
            <tr>
              <td colSpan={5} className="text-slate-500">
                No payment received against this case.
              </td>
            </tr>
          )}
          {data.payments.map((p) => (
            <tr key={p.id}>
              <td>{p.receipt_no ?? "—"}</td>
              <td>{shortDate(p.paid_on)}</td>
              <td>{p.mode}</td>
              <td>{p.reference || p.note || "—"}</td>
              <td className="text-right font-semibold tabular-nums">{rupees(p.amount)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="text-right font-bold uppercase">
              Total received
            </td>
            <td className="text-right font-bold tabular-nums">{rupees(data.paid)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-right font-bold uppercase">
              {data.balance < 0 ? "Refundable to patient" : "Balance due"}
            </td>
            <td className="text-right text-[12pt] font-bold tabular-nums">
              {rupees(Math.abs(data.balance))}
            </td>
          </tr>
        </tbody>
      </table>

      <Signatures roles={["Patient / Attendant", `For ${clinic.name}`]} />
      <DocFooter clinic={clinic} fiscal />
    </>
  );
}

/* -------------------------------------------------------- treatment record */
function Record({ clinic, data }: { clinic: Clinic; data: PatientPayload }) {
  const pkg = data.package;
  const attended = data.sessions.filter((s) => s.is_verified);

  return (
    <>
      <Watermark />
      <Letterhead clinic={clinic} />
      <DocTitle
        title="Physiotherapy Treatment Record"
        meta={[
          ["Record No.", `${data.patient.uhid ?? "—"}/${caseNumber(data)}`],
          ["Issued", longDate(new Date().toISOString())],
        ]}
      />
      <PatientBlock
        patient={data.patient}
        extra={[
          ["Referred By", data.patient.referring_doctor ?? "—"],
          ["Address", data.patient.address ?? "—"],
        ]}
      />

      <section className="avoid-break mb-4 text-[10pt]">
        <h3 className="text-[10pt] font-bold uppercase tracking-wide">Clinical summary</h3>
        <table className="doc-table mt-1">
          <tbody>
            <tr>
              <td className="doc-key w-44">Diagnosis</td>
              <td className="font-semibold">{data.patient.diagnosis || "—"}</td>
            </tr>
            <tr>
              <td className="doc-key">Presenting complaints</td>
              <td>{data.patient.requirements || "—"}</td>
            </tr>
            <tr>
              <td className="doc-key">Treatment plan</td>
              <td className="font-semibold">{pkg?.package_name ?? "—"}</td>
            </tr>
            <tr>
              <td className="doc-key">Period of treatment</td>
              <td>
                {shortDate(pkg?.start_date)} – {shortDate(pkg?.end_date)}
              </td>
            </tr>
            <tr>
              <td className="doc-key">Sessions completed</td>
              <td className="font-semibold">
                {attended.length} of {data.sessions.length}
                {attended.length >= data.sessions.length && data.sessions.length > 0 && (
                  <span className="ml-2 font-bold uppercase">· course completed</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <h3 className="text-[10pt] font-bold uppercase tracking-wide">Session-wise record</h3>
      <table className="doc-table mt-1">
        <thead>
          <tr>
            <th className="w-12">Day</th>
            <th className="w-28">Date</th>
            <th className="w-40">Phase / Goal</th>
            <th>Treatment given</th>
            <th className="w-40">Attended by</th>
          </tr>
        </thead>
        <tbody>
          {data.sessions.map((s) => {
            const plan = roadmapFor(s.session_day);
            return (
              <tr key={s.id}>
                <td className="font-semibold">{s.session_day}</td>
                <td>{s.is_verified ? shortDate(s.session_date) : "—"}</td>
                <td>{plan.phase}</td>
                <td>{s.protocol_note || (s.is_verified ? plan.goal : "Not attended")}</td>
                <td>{s.attended_by || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Signatures roles={[signedBy(clinic), "Clinic Stamp"]} />
      <DocFooter
        clinic={clinic}
        note={
          "Issued at the request of the patient for personal medical records, insurance or " +
          "referral purposes. This record reflects treatment delivered at this establishment only." +
          (clinic.physio_reg_no ? ` Physiotherapist Reg. No. ${clinic.physio_reg_no}.` : "")
        }
      />
    </>
  );
}

/* --------------------------------------------------------- prescription */
/**
 * The one document a patient may hand to somebody else — a referring doctor, an
 * insurer, another physiotherapist — so it carries the prescriber's credentials and
 * is the only one that fails loudly when they are missing.
 *
 * It is forward-looking, which is what separates it from the treatment record: the
 * record says what was done, this says what is to be done. Everything printed here
 * comes out of the case; the modalities, dosages and exercise repetitions are ruled
 * blank space, because software must not issue a clinical instruction no clinician
 * gave.
 */
function Prescription({ clinic, data }: { clinic: Clinic; data: PatientPayload }) {
  const pkg = data.package;
  const attended = data.sessions.filter((s) => s.is_verified).length;
  const upcoming = data.sessions.filter((s) => !s.is_verified);
  const discharged = upcoming.length === 0 && data.sessions.length > 0;

  return (
    <>
      <Watermark />
      <Letterhead clinic={clinic} />
      <DocTitle
        title="Physiotherapy Prescription"
        meta={[
          ["Rx No.", `${data.patient.uhid ?? "—"}/${caseNumber(data)}`],
          ["Date", longDate(new Date().toISOString())],
        ]}
      />
      <PatientBlock
        patient={data.patient}
        extra={[
          ["Referred By", data.patient.referring_doctor ?? "—"],
          ["Address", data.patient.address ?? "—"],
        ]}
      />

      <section className="avoid-break mb-4 text-[10pt]">
        <table className="doc-table">
          <tbody>
            <tr>
              <td className="doc-key w-44">Diagnosis</td>
              <td className="font-semibold">{data.patient.diagnosis || "—"}</td>
            </tr>
            <tr>
              <td className="doc-key">Presenting complaints</td>
              <td>{data.patient.requirements || "—"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* The prescribed course, from the case as booked */}
      <section className="avoid-break mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[17pt] font-bold leading-none">&#8478;</span>
          <h3 className="text-[10pt] font-bold uppercase tracking-wide">Prescribed course</h3>
        </div>
        <table className="doc-table mt-1 text-[10pt]">
          <tbody>
            <tr>
              <td className="doc-key w-44">Treatment plan</td>
              <td className="font-semibold">{pkg?.package_name ?? "—"}</td>
            </tr>
            <tr>
              <td className="doc-key">Sessions</td>
              <td>
                <span className="font-semibold">{data.sessions.length}</span> in total ·{" "}
                {attended} completed · <span className="font-semibold">{upcoming.length}</span>{" "}
                remaining
              </td>
            </tr>
            <tr>
              <td className="doc-key">Period</td>
              <td>
                {shortDate(pkg?.start_date)} – {shortDate(pkg?.end_date)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* What is still to be delivered — the clinic's own written protocol */}
      {!discharged && upcoming.length > 0 && (
        <section className="mb-4">
          <h3 className="text-[10pt] font-bold uppercase tracking-wide">
            Protocol to be followed
          </h3>
          <table className="doc-table mt-1">
            <thead>
              <tr>
                <th className="w-14">Day</th>
                <th className="w-44">Phase</th>
                <th>Planned treatment</th>
                <th className="w-28">Date given</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((s) => {
                const plan = roadmapFor(s.session_day);
                return (
                  <tr key={s.id}>
                    <td className="font-semibold">{s.session_day}</td>
                    <td>{plan.phase}</td>
                    <td>{plan.goal}</td>
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {discharged && (
        <p className="avoid-break mb-4 border border-slate-300 p-2.5 text-[10pt]">
          All <span className="font-semibold">{data.sessions.length}</span> prescribed sessions
          have been completed. This prescription covers the home programme and follow-up below.
        </p>
      )}

      {/* Everything a clinician must write. Blank on purpose — see the note above. */}
      <section className="avoid-break mb-4">
        <h3 className="text-[10pt] font-bold uppercase tracking-wide">
          Electrotherapy / modalities
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
            (machine, parameters, site, duration)
          </span>
        </h3>
        <RuledLines rows={3} />
      </section>

      <section className="avoid-break mb-4">
        <h3 className="text-[10pt] font-bold uppercase tracking-wide">
          Exercise programme
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
            (exercise, sets &times; repetitions, hold, times per day)
          </span>
        </h3>
        <RuledLines rows={4} />
      </section>

      <section className="avoid-break mb-4">
        <h3 className="text-[10pt] font-bold uppercase tracking-wide">
          Advice &amp; precautions
        </h3>
        <RuledLines rows={3} />
      </section>

      <section className="avoid-break mb-2 flex items-end gap-8 text-[10pt]">
        <p className="flex flex-1 items-end gap-2">
          <span className="doc-key shrink-0 pb-0.5">Review on</span>
          <span className="flex-1 border-b border-dotted border-slate-400 pb-0.5 font-semibold">
            {pkg?.end_date ? shortDate(pkg.end_date) : " "}
          </span>
        </p>
        <p className="flex flex-1 items-end gap-2">
          <span className="doc-key shrink-0 pb-0.5">Next appointment</span>
          <span className="flex-1 border-b border-dotted border-slate-400 pb-0.5">&nbsp;</span>
        </p>
      </section>

      <Signatures roles={[signedBy(clinic), "Clinic Stamp"]} />
      <DocFooter
        clinic={clinic}
        note={
          "Valid only over the signature of the prescribing physiotherapist. " +
          "This prescription relates to physiotherapy management at this establishment " +
          "and does not replace the advice of the referring medical practitioner." +
          (clinic.physio_reg_no ? ` Physiotherapist Reg. No. ${clinic.physio_reg_no}.` : "")
        }
      />
    </>
  );
}

/* ---------------------------------------------------- collection day book */
function Daybook({ clinic, report }: { clinic: Clinic; report: BillingReport }) {
  const period =
    report.from || report.to
      ? `${longDate(report.from)} to ${longDate(report.to ?? new Date().toISOString())}`
      : "All receipts to date";

  return (
    <>
      <Watermark />
      <Letterhead clinic={clinic} />
      <DocTitle
        title="Collection & Outstanding Report"
        meta={[
          ["Period", period],
          ["Generated", longDate(report.generated_at)],
        ]}
      />

      <div className="avoid-break mb-5 grid grid-cols-4 gap-3 text-center">
        {[
          ["Receipts", String(report.totals.receipts)],
          ["Collected", rupees(report.totals.collected)],
          ["Refunded", rupees(report.totals.refunded)],
          ["Outstanding", rupees(report.totals.outstanding)],
        ].map(([label, value]) => (
          <div key={label} className="border border-slate-300 p-2">
            <p className="doc-key">{label}</p>
            <p className="text-[12pt] font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <h3 className="text-[10pt] font-bold uppercase tracking-wide">Collection by mode</h3>
      <table className="doc-table mt-1 mb-5">
        <thead>
          <tr>
            <th>Mode</th>
            <th className="w-28 text-right">Receipts</th>
            <th className="w-32 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {report.by_mode.length === 0 && (
            <tr>
              <td colSpan={3} className="text-slate-500">
                Nothing collected in this period.
              </td>
            </tr>
          )}
          {report.by_mode.map((m) => (
            <tr key={m.mode}>
              <td className="font-semibold">{m.mode}</td>
              <td className="text-right tabular-nums">{m.receipts}</td>
              <td className="text-right font-semibold tabular-nums">{rupees(m.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold uppercase">Total</td>
            <td className="text-right font-bold tabular-nums">{report.totals.receipts}</td>
            <td className="text-right font-bold tabular-nums">{rupees(report.totals.collected)}</td>
          </tr>
        </tbody>
      </table>

      <h3 className="text-[10pt] font-bold uppercase tracking-wide">Receipts register</h3>
      <table className="doc-table mt-1">
        <thead>
          <tr>
            <th className="w-28">Receipt No.</th>
            <th className="w-24">Date</th>
            <th className="w-24">UHID</th>
            <th>Patient</th>
            <th className="w-20">Mode</th>
            <th className="w-32">Taken by</th>
            <th className="w-28 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {report.ledger.length === 0 && (
            <tr>
              <td colSpan={7} className="text-slate-500">
                No receipts in this period.
              </td>
            </tr>
          )}
          {report.ledger.map((r) => (
            <tr key={r.id}>
              <td>{r.receipt_no ?? "—"}</td>
              <td>{shortDate(r.paid_on)}</td>
              <td>{r.uhid ?? "—"}</td>
              <td className="uppercase">{r.full_name}</td>
              <td>{r.mode}</td>
              <td>{r.recorded_by || "—"}</td>
              <td className="text-right font-semibold tabular-nums">{rupees(r.amount)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={6} className="text-right font-bold uppercase">
              Total collected
            </td>
            <td className="text-right font-bold tabular-nums">{rupees(report.totals.collected)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[9pt] font-semibold uppercase">
        {amountInWords(report.totals.collected)}
      </p>

      <div className="page-break" />

      <h3 className="mt-6 text-[10pt] font-bold uppercase tracking-wide">
        Outstanding as on {longDate(report.generated_at)}
      </h3>
      <p className="mb-1 text-[8.5pt] text-slate-600">
        Dues are shown in full regardless of the period above — a balance raised earlier is still
        owed today.
      </p>
      <table className="doc-table">
        <thead>
          <tr>
            <th className="w-24">UHID</th>
            <th>Patient</th>
            <th className="w-24">Phone</th>
            <th>Treatment</th>
            <th className="w-20 text-right">Age</th>
            <th className="w-24 text-right">Billed</th>
            <th className="w-24 text-right">Paid</th>
            <th className="w-24 text-right">Due</th>
          </tr>
        </thead>
        <tbody>
          {report.outstanding.length === 0 && (
            <tr>
              <td colSpan={8} className="text-slate-500">
                Every case is settled.
              </td>
            </tr>
          )}
          {report.outstanding.map((r) => (
            <tr key={r.package_id}>
              <td>{r.uhid ?? "—"}</td>
              <td className="uppercase">{r.full_name}</td>
              <td>{r.phone_number}</td>
              <td>{r.package_name}</td>
              <td className="text-right tabular-nums">{r.days}d</td>
              <td className="text-right tabular-nums">{rupees(r.billed)}</td>
              <td className="text-right tabular-nums">{rupees(r.paid)}</td>
              <td className="text-right font-bold tabular-nums">{rupees(r.balance)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={7} className="text-right font-bold uppercase">
              Total outstanding
            </td>
            <td className="text-right font-bold tabular-nums">
              {rupees(report.totals.outstanding)}
            </td>
          </tr>
        </tbody>
      </table>

      {report.ageing.length > 0 && (
        <>
          <h3 className="mt-5 text-[10pt] font-bold uppercase tracking-wide">Ageing of dues</h3>
          <table className="doc-table mt-1">
            <thead>
              <tr>
                <th>Age of case</th>
                <th className="w-28 text-right">Cases</th>
                <th className="w-32 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.ageing.map((b) => (
                <tr key={b.bucket}>
                  <td className="font-semibold">{b.bucket}</td>
                  <td className="text-right tabular-nums">{b.cases}</td>
                  <td className="text-right font-semibold tabular-nums">{rupees(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <Signatures roles={["Prepared by", "Verified by", "For " + clinic.name]} />
      <DocFooter
        clinic={clinic}
        fiscal
        note="Internal financial record. Cash in hand must be reconciled against the CASH row above before the drawer is closed."
      />
    </>
  );
}
