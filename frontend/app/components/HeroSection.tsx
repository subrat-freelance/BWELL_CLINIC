"use client";

import Image from "next/image";
import { Calendar, PhoneCall, Star, ArrowRight } from "lucide-react";
import { CLINIC, addressLine, directionsHref, spaced, telHref } from "@/lib/clinic";

/**
 * The hero sits on the clinic's own signboard blue, with the practice card set
 * on it like a printed card on a counter. No gradient text, no blurred orbs, no
 * glass — the clinic's identity is a flat blue board with white type on it, and
 * that is a stronger starting point than anything a palette generator offers.
 */

interface HeroSectionProps {
  onOpenBooking: (doctorName?: string, serviceName?: string) => void;
}

const [primaryPhone] = CLINIC.phones;

const PROMISES = [
  "One-to-one treatment by a qualified physiotherapist",
  "A written treatment plan you can follow session by session",
  "Morning and evening consultation hours",
  "Printed treatment record and receipt for every visit",
];

export default function HeroSection({ onOpenBooking }: HeroSectionProps) {
  return (
    <section className="bg-brand text-white">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-16">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* What we do, and for whom */}
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/70">
              <a
                href={CLINIC.google.listing}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-white underline-offset-4 hover:underline"
              >
                <Star size={13} className="fill-brand-lime text-brand-lime" />
                {CLINIC.google.rating.toFixed(1)} on Google
              </a>
              <span aria-hidden className="h-3 w-px bg-white/25" />
              <span>
                {CLINIC.address.line2}, {CLINIC.address.city}
              </span>
            </div>

            <h1 className="mt-7 font-display text-[2.5rem] leading-[1.08] tracking-[-0.015em] sm:text-6xl">
              Back, joint or nerve pain
              <br />
              keeping you from your day?
              <span className="mt-3 block text-brand-lime">
                Let&rsquo;s get you moving again.
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-white/80">
              {CLINIC.name} in {CLINIC.address.line2} treats{" "}
              {CLINIC.specialities
                .map((s) => s.toLowerCase())
                .join(", ")
                .replace(/, ([^,]*)$/, " and $1")}{" "}
              conditions. Every patient is assessed in person, given a written
              session-by-session plan, and treated one-to-one by a qualified physiotherapist.
            </p>

            <ul className="mt-8 grid max-w-2xl gap-x-8 gap-y-3 border-t border-white/15 pt-7 sm:grid-cols-2">
              {PROMISES.map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-snug text-white/90">
                  <span aria-hidden className="mt-2 h-px w-4 shrink-0 bg-brand-lime" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onOpenBooking()}
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-white px-6 py-3.5 text-sm font-semibold text-brand transition-colors hover:bg-brand-lime hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Calendar size={17} />
                Request an appointment
              </button>
              <a
                href={telHref(primaryPhone)}
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-white/35 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <PhoneCall size={17} />
                Call +91 {spaced(primaryPhone)}
              </a>
            </div>
          </div>

          {/* The practice card — the same information the clinic prints on paper */}
          <div className="lg:col-span-5">
            <div className="rounded-sm bg-white text-ink">
              <div className="flex items-center gap-3 border-b border-rule px-6 py-5">
                <Image
                  src="/logo-mark.png"
                  alt=""
                  width={512}
                  height={512}
                  className="h-11 w-11 shrink-0"
                  priority
                />
                <div>
                  <h2 className="font-display text-lg leading-tight text-brand">{CLINIC.name}</h2>
                  <p className="text-[11px] italic text-slate-500">
                    &ldquo;{CLINIC.tagline}&rdquo;
                  </p>
                </div>
              </div>

              <div className="border-b border-rule px-6 py-5">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Physiotherapists
                </h3>
                <ul className="mt-3 space-y-3">
                  {CLINIC.physios.map((doc) => (
                    <li key={doc.name} className={doc.available ? "" : "opacity-70"}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-ink">{doc.name}</span>
                        {!doc.available && (
                          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Not available yet
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {doc.qualification} · {doc.institute}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-b border-rule px-6 py-5">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Consultation timings
                </h3>
                <dl className="mt-3 space-y-1.5">
                  {CLINIC.hours.map((slot) => (
                    <div key={slot.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-sm text-slate-600">{slot.label}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-ink">{slot.time}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Please call ahead to confirm Sunday and public-holiday timings.
                </p>
              </div>

              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start justify-between gap-4 px-6 py-5 transition-colors hover:bg-paper"
              >
                <span className="text-xs leading-relaxed text-slate-600">{addressLine}</span>
                <ArrowRight
                  size={15}
                  className="mt-0.5 shrink-0 text-brand transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
