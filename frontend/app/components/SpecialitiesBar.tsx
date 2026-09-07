"use client";

import { Activity, Bone, Brain, Baby, FileText, Star } from "lucide-react";
import { CLINIC } from "@/lib/clinic";

/**
 * The four specialities the clinic prints on its own signboard, plus the paperwork
 * a patient actually walks out with. No certifications, council approvals or
 * insurance tie-ups are listed here: the clinic has not published any, and
 * inventing them on the site of a real clinical establishment is not an option.
 */
const ICONS = [Bone, Activity, Brain, Baby];

const PAPERWORK = [
  { icon: FileText, label: "Itemised receipt for every payment" },
  { icon: FileText, label: "Printable treatment record on request" },
];

export default function SpecialitiesBar() {
  return (
    <section className="bg-brand-deep text-slate-300 py-10 border-y border-white/15 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-12 items-center">
          {/* Specialities, verbatim from the signboard */}
          <div className="lg:col-span-7 space-y-4 border-b lg:border-b-0 lg:border-r border-white/15 pb-6 lg:pb-0 lg:pr-8">
            <h2 className="text-xs font-bold text-brand-lime uppercase tracking-wider">
              Specialised in
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {CLINIC.specialities.map((speciality, i) => {
                const Icon = ICONS[i] ?? Activity;
                return (
                  <div
                    key={speciality}
                    className="flex items-center gap-2 rounded-lg border border-white/15 bg-brand-deep/80 px-3.5 py-2 text-sm font-bold text-slate-100"
                  >
                    <Icon size={15} className="text-brand-lime shrink-0" />
                    <span>{speciality}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-slate-400 max-w-xl">
              Not sure which applies to you? Describe where it hurts and how long it has
              hurt when you call — that is enough for reception to book you with the right
              physiotherapist.
            </p>
          </div>

          {/* What you leave with */}
          <div className="lg:col-span-5 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              What you leave with
            </h2>
            <ul className="space-y-2">
              {PAPERWORK.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-xs font-medium text-slate-300"
                >
                  <item.icon size={14} className="text-brand-lime shrink-0" />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            <a
              href={CLINIC.google.listing}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-brand-deep/80 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-amber-500/50 hover:text-white"
            >
              <Star size={13} className="fill-amber-400 text-amber-400" />
              <span>Rated {CLINIC.google.rating.toFixed(1)} on Google — read the reviews</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
