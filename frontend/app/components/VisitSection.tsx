"use client";

import { MapPin, Phone, Clock, Navigation, Star, MessageCircle } from "lucide-react";
import {
  CLINIC,
  addressLine,
  directionsHref,
  spaced,
  telHref,
  waHref,
} from "@/lib/clinic";

/**
 * Where the clinic is, when it is open and how to reach it. Everything here comes
 * from the clinic's Google listing and its signboard.
 *
 * The map is Google's keyless embed endpoint — no API key, no map library.
 */
const MAP_EMBED = `https://www.google.com/maps?q=${CLINIC.google.lat},${CLINIC.google.lng}&hl=en&z=16&output=embed`;

export default function VisitSection() {
  return (
    <section id="visit" className="py-20 bg-white relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/8 px-3.5 py-1 text-xs font-bold text-brand uppercase tracking-wider">
            <MapPin size={14} className="text-brand" />
            Visit the clinic
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Find us in {CLINIC.address.line2}
          </h2>
          <p className="mt-3 text-base text-slate-600">
            {CLINIC.address.line1}.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-12">
          {/* Map */}
          <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            <iframe
              title={`Map to ${CLINIC.name}`}
              src={MAP_EMBED}
              className="h-[380px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>

          {/* Details */}
          <div className="lg:col-span-5 space-y-4">
            <div className="card p-6 space-y-5 bg-slate-50/60">
              <div className="flex items-start gap-3">
                <MapPin size={18} className="mt-0.5 shrink-0 text-brand" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Address
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-800">{addressLine}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Plus code {CLINIC.google.plusCode}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 border-t border-slate-200 pt-5">
                <Clock size={18} className="mt-0.5 shrink-0 text-brand" />
                <div className="flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Consultation timings
                  </div>
                  <dl className="mt-1.5 space-y-1">
                    {CLINIC.hours.map((slot) => (
                      <div key={slot.label} className="flex items-baseline justify-between gap-3">
                        <dt className="text-sm text-slate-600">{slot.label}</dt>
                        <dd className="text-sm font-bold text-slate-900 tabular-nums">
                          {slot.time}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-slate-500">
                    Please call ahead to confirm Sunday and public-holiday timings.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 border-t border-slate-200 pt-5">
                <Phone size={18} className="mt-0.5 shrink-0 text-brand" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Phone
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {CLINIC.phones.map((phone) => (
                      <a
                        key={phone}
                        href={telHref(phone)}
                        className="block text-sm font-bold text-slate-900 hover:text-brand"
                      >
                        +91 {spaced(phone)}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary justify-center py-3 text-xs"
              >
                <Navigation size={15} />
                <span>Get directions</span>
              </a>
              <a
                href={waHref(
                  CLINIC.phones[0],
                  `Hi ${CLINIC.name}, I would like to ask about a physiotherapy consultation.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-brand-olive/35 bg-brand-olive/10 px-4 py-3 text-xs font-bold text-brand-olive transition hover:bg-brand-olive/20"
              >
                <MessageCircle size={15} />
                <span>Message on WhatsApp</span>
              </a>
            </div>

            <a
              href={CLINIC.google.listing}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-amber-300"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Star size={14} className="fill-amber-400 text-amber-400" />
                Rated {CLINIC.google.rating.toFixed(1)} on Google
              </span>
              <span className="text-xs font-semibold text-brand">Read the reviews →</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
