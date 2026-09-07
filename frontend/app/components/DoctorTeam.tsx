"use client";

import Image from "next/image";
import { Calendar, GraduationCap, Users, Phone } from "lucide-react";
import { CLINIC, availablePhysios, spaced, telHref } from "@/lib/clinic";

/**
 * The physiotherapists the clinic names on its own signboard, with the
 * qualifications exactly as the clinic states them. Council registration
 * numbers, years of experience, patient counts and star ratings are deliberately
 * absent — the clinic has not published any, and a fabricated council number on
 * a real practitioner's profile is a regulatory problem.
 */

interface DoctorTeamProps {
  onOpenBooking: (doctorName?: string, serviceName?: string) => void;
}

const [primaryPhone] = CLINIC.phones;

export default function DoctorTeam({ onOpenBooking }: DoctorTeamProps) {
  return (
    <section id="doctors" className="py-20 bg-slate-50 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/8 px-3.5 py-1 text-xs font-bold text-brand uppercase tracking-wider">
            <Users size={14} className="text-brand" />
            Who will treat you
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Your physiotherapists
          </h2>
          <p className="mt-3 text-base text-slate-600">
            You are assessed and treated by the same physiotherapist through your course of
            treatment — not handed between assistants.
          </p>
        </div>

        <div className={`mt-12 grid gap-8 mx-auto ${availablePhysios.length > 1 ? "sm:grid-cols-2 max-w-3xl" : "max-w-md"}`}>
          {availablePhysios.map((doc) => (
            <div
              key={doc.name}
              className="card group flex flex-col justify-between p-7 hover:border-brand-mid hover:shadow-xl transition-all duration-300 bg-white"
            >
              <div>
                {doc.photo ? (
                  <Image
                    src={doc.photo}
                    alt={doc.name}
                    width={400}
                    height={400}
                    className="h-20 w-20 rounded-2xl object-cover shadow-md"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand to-brand text-white font-extrabold text-xl shadow-md">
                    {doc.initials}
                  </div>
                )}

                <h3 className="mt-5 font-extrabold text-slate-900 text-lg group-hover:text-brand transition">
                  {doc.name}
                </h3>
                <p className="text-xs font-semibold text-brand mt-0.5">Physiotherapist</p>

                <div className="mt-3 flex items-start gap-1.5 text-xs text-slate-600 font-medium">
                  <GraduationCap size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-800">{doc.qualification}</strong>
                    <span className="block text-slate-500">{doc.institute}</span>
                  </span>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5">
                    Clinic specialities
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CLINIC.specialities.map((spec) => (
                      <span
                        key={spec}
                        className="rounded-md bg-brand/8 px-2 py-0.5 text-[11px] font-medium text-brand"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onOpenBooking(doc.name)}
                className="mt-6 w-full btn-primary py-2.5 text-xs"
              >
                <Calendar size={14} />
                <span>Request an appointment</span>
              </button>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-600">
          Prefer to speak to someone?{" "}
          <a
            href={telHref(primaryPhone)}
            className="inline-flex items-center gap-1 font-bold text-brand hover:text-brand"
          >
            <Phone size={14} />
            Call the clinic on +91 {spaced(primaryPhone)}
          </a>
        </p>
      </div>
    </section>
  );
}
