"use client";

import { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  RotateCcw,
  Calendar,
  Check,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { availablePhysios } from "@/lib/clinic";

const PHYSIOS = availablePhysios;

interface RecoveryEstimatorProps {
  onOpenBooking: (doctorName?: string, serviceName?: string) => void;
}

export default function RecoveryEstimator({ onOpenBooking }: RecoveryEstimatorProps) {
  const [step, setStep] = useState<number>(1);
  const [area, setArea] = useState<string>("back");
  const [duration, setDuration] = useState<string>("acute");
  const [severity, setSeverity] = useState<number>(5);

  const calculateEstimate = () => {
    let baseSessions = 5;
    let therapyName = "General rehabilitation programme";
    let firstRelief = "Session 2";

    if (area === "back") {
      therapyName = "Lower back & sciatica rehabilitation";
      baseSessions = duration === "chronic" ? 10 : duration === "subacute" ? 7 : 5;
    } else if (area === "knee") {
      therapyName = "Knee & joint rehabilitation";
      baseSessions = duration === "chronic" ? 9 : 6;
    } else if (area === "neck") {
      therapyName = "Neck & cervical rehabilitation";
      baseSessions = duration === "chronic" ? 8 : 5;
    } else if (area === "shoulder") {
      therapyName = "Shoulder rehabilitation";
      baseSessions = duration === "chronic" ? 8 : 6;
    } else {
      therapyName = "Post-operative / general rehabilitation";
      baseSessions = 7;
    }

    if (severity > 7) {
      baseSessions += 2;
      firstRelief = "Session 1 - 2";
    }

    return {
      sessions: baseSessions,
      therapyName,
      firstRelief,
      recommendedDoctor: PHYSIOS[0].name,
    };
  };

  const result = calculateEstimate();

  return (
    <section id="estimator" className="py-20 bg-brand-deep text-white relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-1/4 h-80 w-80 rounded-full bg-brand-mid/10 blur-3xl" />
      <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-brand-olive/10 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-mid/20 px-3.5 py-1 text-xs font-bold text-brand-lime border border-brand-mid/30 uppercase tracking-wider">
            <Sparkles size={14} className="text-brand-lime" />
            Rough session estimate
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            How long might this take?
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Three questions for a rough idea of the number of sessions. It is a guide, not a diagnosis — only an in-person assessment can tell you what you actually need.
          </p>
        </div>

        {/* Wizard Card */}
        <div className="mt-10 card-dark glass-card-dark p-6 sm:p-10 border-white/15">
          {/* Step Indicator */}
          <div className="mb-8 flex items-center justify-between border-b border-white/15 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {step}
              </span>
              <span className="text-sm font-semibold text-slate-300">
                {step === 1 && "Step 1: Select Affected Region"}
                {step === 2 && "Step 2: Symptom Duration"}
                {step === 3 && "Step 3: Pain Intensity"}
                {step === 4 && "Your Custom Recovery Plan"}
              </span>
            </div>
            <div className="text-xs text-slate-400">Step {step} of 4</div>
          </div>

          {/* STEP 1: Area */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <h3 className="text-lg font-bold text-white">Where is your main discomfort?</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { id: "back", label: "Lower Back / Sciatica", icon: "🦴" },
                  { id: "neck", label: "Neck & Shoulders", icon: "🧠" },
                  { id: "knee", label: "Knee & Leg Joints", icon: "🦵" },
                  { id: "shoulder", label: "Shoulder / Arm", icon: "💪" },
                  { id: "foot", label: "Heel / Foot / Ankle", icon: "👟" },
                  { id: "other", label: "Post-Op / Other", icon: "🏥" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setArea(item.id)}
                    className={`p-4 rounded-xl border text-left transition ${
                      area === item.id
                        ? "border-brand-lime bg-brand-deep/60 ring-2 ring-brand-lime/30"
                        : "border-white/15 bg-brand-deep/40 hover:border-white/25"
                    }`}
                  >
                    <span className="text-2xl block mb-2">{item.icon}</span>
                    <span className="text-sm font-bold text-slate-200 block">{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="btn-primary"
                >
                  <span>Next Step</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Duration */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <h3 className="text-lg font-bold text-white">How long have you been experiencing this pain?</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { id: "acute", title: "Less than 2 Weeks", desc: "Recent strain, sprain or acute flare-up" },
                  { id: "subacute", title: "2 Weeks - 3 Months", desc: "Persistent pain that isn't resolving" },
                  { id: "chronic", title: "More than 3 Months", desc: "Long-term chronic discomfort" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setDuration(item.id)}
                    className={`p-5 rounded-xl border text-left transition ${
                      duration === item.id
                        ? "border-brand-lime bg-brand-deep/60 ring-2 ring-brand-lime/30"
                        : "border-white/15 bg-brand-deep/40 hover:border-white/25"
                    }`}
                  >
                    <span className="text-base font-bold text-brand-lime block mb-1">{item.title}</span>
                    <span className="text-xs text-slate-400 block">{item.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="btn-ghost text-xs text-slate-300 bg-white/10 border-white/25 hover:bg-white/20"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="btn-primary"
                >
                  <span>Next Step</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Severity */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <h3 className="text-lg font-bold text-white">Current Pain Level (1 to 10):</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-lime">1 (Mild Discomfort)</span>
                  <span className="text-2xl font-black text-brand-lime">{severity} / 10</span>
                  <span className="text-xs font-semibold text-rose-400">10 (Severe / Unbearable)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                  className="w-full accent-brand-lime h-3 rounded-lg bg-white/10 cursor-pointer"
                />
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="btn-ghost text-xs text-slate-300 bg-white/10 border-white/25 hover:bg-white/20"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="btn-primary"
                >
                  <span>Generate Estimate</span>
                  <Zap size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Results Display */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="rounded-2xl border border-brand-mid/30 bg-brand-deep/50 p-6">
                <div className="flex items-center justify-between mb-4 border-b border-brand-deep/50 pb-3">
                  <span className="text-xs font-bold text-brand-lime uppercase tracking-wider">
                    Rough estimate
                  </span>
                  <span className="rounded-full bg-white/20/60 px-3 py-0.5 text-xs font-bold text-slate-300">
                    Guide only
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 text-center mb-6">
                  <div className="rounded-xl bg-brand-deep/80 p-3 border border-white/15">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Est. Sessions</span>
                    <span className="text-2xl font-black text-brand-lime">{result.sessions} Sessions</span>
                  </div>
                  <div className="rounded-xl bg-brand-deep/80 p-3 border border-white/15">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Expected Relief</span>
                    <span className="text-xl font-bold text-brand-lime">{result.firstRelief}</span>
                  </div>
                  <div className="rounded-xl bg-brand-deep/80 p-3 border border-white/15">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Suggested focus</span>
                    <span className="text-xs font-bold text-slate-200 mt-1 block">{result.therapyName}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs text-slate-300 bg-brand-deep/60 p-3.5 rounded-xl border border-white/15">
                  <Check size={16} className="text-brand-lime shrink-0 mt-0.5" />
                  <span>
                    This is a rough guide based on typical physiotherapy courses. Your first in-person assessment sets the actual plan.
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  <RotateCcw size={14} />
                  <span>Reset Estimator</span>
                </button>
                <button
                  onClick={() => onOpenBooking(result.recommendedDoctor, result.therapyName)}
                  className="btn-primary"
                >
                  <Calendar size={16} />
                  <span>Book Priority Slot for This Plan</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
