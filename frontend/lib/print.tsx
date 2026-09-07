"use client";

/**
 * The furniture every printed document shares.
 *
 * A receipt or a treatment record is a medical-legal document: it has to name the
 * establishment, its registration, the patient's hospital number, the date it was
 * issued and who issued it. Everything here exists to put those on the page, and
 * the styling stays monochrome so it survives the clinic's laser printer.
 */
import type { Clinic, Patient } from "./api";
import { longDate } from "./api";

/**
 * The clinic's mark behind the document body. A plain <img> for the same reason the
 * letterhead uses one: next/image can still be loading when window.print() fires.
 */
export function Watermark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-mark.png" alt="" aria-hidden className="doc-watermark" />;
}

export function Letterhead({ clinic }: { clinic: Clinic }) {
  const contact = [clinic.phone && `Ph ${clinic.phone}`, clinic.email].filter(Boolean).join("  ·  ");
  const legal = [
    clinic.registration_no && `Reg. No. ${clinic.registration_no}`,
    clinic.gstin && `GSTIN ${clinic.gstin}`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <header className="avoid-break flex items-start gap-4 border-b-2 border-slate-900 pb-3">
      {/* The clinic's own mark, cropped from its signboard. A plain <img>, not
          next/image: the optimised element can still be loading when window.print()
          fires, and a letterhead that prints without its logo is worse than one
          that never had it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={56} height={56} className="mt-0.5 h-14 w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        <h1 className="text-[16pt] font-bold uppercase tracking-tight">{clinic.name}</h1>
        {clinic.tagline && (
          <p className="text-[9pt] uppercase tracking-[0.15em] text-slate-600">{clinic.tagline}</p>
        )}
        <div className="mt-1.5 space-y-0.5 text-[9pt] text-slate-700">
          {clinic.address && <p className="whitespace-pre-line">{clinic.address}</p>}
          {contact && <p>{contact}</p>}
          {legal && <p className="font-semibold">{legal}</p>}
        </div>
      </div>
    </header>
  );
}

/**
 * Ruled space for something only a clinician may write.
 *
 * Deliberately blank. A prescription that arrives with modalities, dosages or
 * exercise repetitions already filled in by software is a clinical instruction
 * nobody prescribed — so the document prints what the record actually holds and
 * gives the physiotherapist lines for the rest.
 */
export function RuledLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="avoid-break mt-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[7mm] border-b border-dotted border-slate-400" />
      ))}
    </div>
  );
}

/** The banner naming the document, with the identifiers that make it citable. */
export function DocTitle({ title, meta }: { title: string; meta: [string, string][] }) {
  return (
    <>
      <h2 className="doc-title">{title}</h2>
      <div className="mb-4 flex flex-wrap justify-between gap-x-8 gap-y-1 text-[10pt]">
        {meta.map(([label, value]) => (
          <span key={label}>
            <span className="doc-key">{label} </span>
            <span className="font-semibold">{value}</span>
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Who this document is about. The UHID leads because a name plus a household phone
 * number identifies nobody — which is the whole reason this clinic has UHIDs.
 */
export function PatientBlock({ patient, extra }: { patient: Patient; extra?: [string, string][] }) {
  const fields: [string, string][] = [
    ["UHID", patient.uhid ?? "—"],
    ["Patient Name", patient.full_name],
    ["Age / Sex", `${patient.age} yrs / ${patient.gender}`],
    ["Phone", patient.phone_number],
    ...(extra ?? []),
  ];
  return (
    <section className="avoid-break mb-4 grid grid-cols-2 gap-x-8 gap-y-1.5 border border-slate-300 p-3 text-[10pt]">
      {fields.map(([label, value]) => (
        <p key={label} className="flex gap-2">
          <span className="doc-key w-28 shrink-0 pt-0.5">{label}</span>
          <span className="font-semibold">{value || "—"}</span>
        </p>
      ))}
    </section>
  );
}

/** Nobody accepts an unsigned clinical or money document. */
export function Signatures({ roles }: { roles: string[] }) {
  return (
    <div className="avoid-break mt-10 flex justify-between gap-8">
      {roles.map((role) => (
        <div key={role} className="min-w-40 text-center">
          <div className="h-10" />
          <p className="border-t border-slate-900 pt-1 text-[9pt] font-semibold uppercase tracking-wide">
            {role}
          </p>
        </div>
      ))}
    </div>
  );
}

/** `fiscal` adds the clinic's GST/bill-of-supply wording — money documents only.
 *  It is nonsense on a treatment record, which bills nobody. */
export function DocFooter({
  clinic,
  note,
  fiscal,
}: {
  clinic: Clinic;
  note?: string;
  fiscal?: boolean;
}) {
  return (
    <footer className="avoid-break mt-8 border-t border-slate-300 pt-2 text-[8pt] leading-relaxed text-slate-600">
      {note && <p>{note}</p>}
      {fiscal && clinic.footer_note && <p>{clinic.footer_note}</p>}
      <p>
        Computer-generated document · Printed {longDate(new Date().toISOString())} · {clinic.name}
      </p>
    </footer>
  );
}

/** The physiotherapist whose name closes a clinical report. */
export const signedBy = (clinic: Clinic) =>
  [clinic.physio_name, clinic.physio_qualification].filter(Boolean).join(", ") ||
  "Consultant Physiotherapist";
