"use client";

import { useState } from "react";
import {
  Activity,
  Check,
  ChevronRight,
  Clock,
  Sparkles,
  Zap,
  Calendar,
  AlertCircle,
} from "lucide-react";

interface BodyRegion {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  commonConditions: string[];
  recommendedTreatments: string[];
  avgSessions: string;
  description: string;
}

const BODY_REGIONS: BodyRegion[] = [
  {
    id: "lumbar",
    name: "Back & Lumbar Spine",
    subtitle: "Sciatica, Herniated Disc, Chronic Lower Back Pain",
    icon: "🦴",
    commonConditions: [
      "Sciatica & Nerve Compression",
      "Lumbar Disc Herniation / Bulge",
      "Spinal Stenosis",
      "Postural Muscle Deconditioning",
    ],
    recommendedTreatments: [
      "Computerized Mechanical Spinal Decompression",
      "Class-IV Deep Tissue Laser Therapy",
      "McKenzie Spinal Extension Protocol",
      "Core Stabilization & Muscle Re-education",
    ],
    avgSessions: "6 - 10 Sessions",
    description:
      "Our specialized spine decompressive therapy reduces intra-discal pressure, relieves leg radiation pain, and repairs damaged spinal discs without invasive surgery.",
  },
  {
    id: "neck",
    name: "Neck & Cervical Spine",
    subtitle: "Cervical Spondylosis, Pinched Nerve, Tech Neck",
    icon: "🧠",
    commonConditions: [
      "Cervical Radiculopathy",
      "Tension Headaches & Neck Stiffness",
      "Postural Kyphosis / Tech Neck",
      "Whiplash & Traumatic Neck Injury",
    ],
    recommendedTreatments: [
      "Cervical Traction & Mobilization",
      "Myofascial Trigger Point Dry Needling",
      "Targeted IFT & Microcurrent Therapy",
      "Ergonomic & Postural Re-alignment",
    ],
    avgSessions: "5 - 8 Sessions",
    description:
      "Precision manual mobilization combined with neuromuscular re-education relaxes tight trapezius muscles and eliminates chronic arm numbness and headaches.",
  },
  {
    id: "shoulder",
    name: "Shoulder & Rotator Cuff",
    subtitle: "Frozen Shoulder, Tendonitis, Impingement",
    icon: "💪",
    commonConditions: [
      "Adhesive Capsulitis (Frozen Shoulder)",
      "Rotator Cuff Tear & Tendonitis",
      "Subacromial Impingement Syndrome",
      "Shoulder Dislocation & Instability",
    ],
    recommendedTreatments: [
      "Extracorporeal Shockwave Therapy (ESWT)",
      "Glenohumeral Joint Hydro-Mobilization",
      "Dynamic Ultrasound Electrotherapy",
      "Rotator Cuff Strengthening Exercises",
    ],
    avgSessions: "6 - 9 Sessions",
    description:
      "Pain-free joint mobilization and acoustic shockwaves break down calcified scar tissue, restoring 100% overhead reach and night sleep quality.",
  },
  {
    id: "knee",
    name: "Knee & ACL Ligaments",
    subtitle: "Osteoarthritis, ACL/Meniscus Tear, Runner’s Knee",
    icon: "🦵",
    commonConditions: [
      "Grade 1-3 Osteoarthritis (Knee Degeneration)",
      "Post-Op ACL Reconstruction Rehab",
      "Meniscal Tear & Patellofemoral Pain",
      "Ligament Sprains & Cartilage Wear",
    ],
    recommendedTreatments: [
      "Pulsed Electromagnetic Field (PEMF) Therapy",
      "Proprioceptive Neuromuscular Training",
      "Kinesio Taping & Quad Strengthening",
      "Custom Orthotic Gait Correction",
    ],
    avgSessions: "7 - 12 Sessions",
    description:
      "Preserve natural knee joints and avoid premature knee replacement. Advanced cartilage nutrition exercises and stability protocols reduce joint friction immediately.",
  },
  {
    id: "hip",
    name: "Hip & Pelvis",
    subtitle: "Bursitis, Labral Tear, Piriformis Syndrome",
    icon: "🚶",
    commonConditions: [
      "Trochanteric Bursitis",
      "Piriformis Syndrome & Hip Impingement",
      "AVN (Avascular Necrosis Early Stage)",
      "Pelvic Tilt & Gait Asymmetry",
    ],
    recommendedTreatments: [
      "Deep Friction Massage & Myofascial Release",
      "Hip Capsule Stretching Protocols",
      "High-Frequency Ultrasound Therapy",
      "Pelvic Alignment & Gait Training",
    ],
    avgSessions: "6 - 10 Sessions",
    description:
      "Targeted pelvic re-alignment and deep muscle releases alleviate sharp groin/hip pain, allowing comfortable walking and stair climbing.",
  },
  {
    id: "foot",
    name: "Foot, Ankle & Heel",
    subtitle: "Plantar Fasciitis, Achilles Tendonitis, Heel Spurs",
    icon: "👟",
    commonConditions: [
      "Plantar Fasciitis & Heel Spur Pain",
      "Achilles Tendinopathy",
      "Ankle Ligament Sprain",
      "Flat Foot & Arch Collapse Pain",
    ],
    recommendedTreatments: [
      "Radial Acoustic Shockwave Therapy",
      "Plantar Fascia Stretch & Eccentric Loading",
      "Cryo-Thermal Contrast Therapy",
      "Custom Arch Support Fitting",
    ],
    avgSessions: "4 - 7 Sessions",
    description:
      "Eliminate sharp morning heel pain within 3 sessions using targeted shockwave therapy that stimulates collagen regeneration in damaged tendons.",
  },
];

interface PainNavigatorProps {
  onOpenBooking: (doctorName?: string, serviceName?: string) => void;
}

export default function PainNavigator({ onOpenBooking }: PainNavigatorProps) {
  const [selectedRegionId, setSelectedRegionId] = useState<string>("lumbar");

  const currentRegion =
    BODY_REGIONS.find((r) => r.id === selectedRegionId) || BODY_REGIONS[0];

  return (
    <section id="pain-navigator" className="py-20 bg-slate-50 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/8 px-3.5 py-1 text-xs font-bold text-brand uppercase tracking-wider">
            <Activity size={14} className="text-brand" />
            Interactive Clinical Assessment
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Where Are You Experiencing Pain?
          </h2>
          <p className="mt-3 text-base text-slate-600">
            Select the area that hurts to see the conditions the clinic treats there, and roughly how many sessions a course of treatment usually runs to.
          </p>
        </div>

        {/* Navigator Body Grid */}
        <div className="mt-12 grid gap-8 lg:grid-cols-12 items-start">
          {/* Region Tabs Column */}
          <div className="lg:col-span-5 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">
              Select Anatomical Region:
            </div>
            {BODY_REGIONS.map((region) => {
              const isSelected = region.id === selectedRegionId;
              return (
                <button
                  key={region.id}
                  onClick={() => setSelectedRegionId(region.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between ${
                    isSelected
                      ? "border-brand-mid bg-white shadow-md shadow-brand-mid/10 ring-2 ring-brand-mid/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-2xl">{region.icon}</span>
                    <div>
                      <h3
                        className={`font-bold text-sm ${
                          isSelected ? "text-brand-deep" : "text-slate-800"
                        }`}
                      >
                        {region.name}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {region.subtitle}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className={`transition-transform ${
                      isSelected ? "text-brand translate-x-1" : "text-slate-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Region Details Display Panel */}
          <div className="lg:col-span-7">
            <div className="card p-6 sm:p-8 border-brand-mid/30 bg-gradient-to-br from-white via-white to-brand-mid/30 shadow-lg relative overflow-hidden">
              {/* Top Accent Strip */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-mid to-brand-olive" />

              {/* Title Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{currentRegion.icon}</span>
                    <h3 className="text-2xl font-extrabold text-slate-900">
                      {currentRegion.name}
                    </h3>
                  </div>
                  <p className="text-sm text-brand font-medium mt-1">
                    {currentRegion.subtitle}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-slate-100 border border-slate-200 px-3.5 py-1.5 text-center">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                      Est. Timeline
                    </div>
                    <div className="text-sm font-bold text-slate-800 flex items-center gap-1 justify-center">
                      <Clock size={12} className="text-brand" />
                      {currentRegion.avgSessions}
                    </div>
                  </div>
                </div>
              </div>

              {/* Overview */}
              <p className="mt-5 text-sm leading-relaxed text-slate-600">
                {currentRegion.description}
              </p>

              {/* Two Column Breakdown */}
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                {/* Column 1: Conditions Treated */}
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
                    <AlertCircle size={14} className="text-amber-500" />
                    Common Conditions Treated:
                  </div>
                  <ul className="space-y-2 text-xs font-medium text-slate-700">
                    {currentRegion.commonConditions.map((cond, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-mid mt-1.5 shrink-0" />
                        <span>{cond}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Column 2: Clinical Protocol */}
                <div className="rounded-xl bg-brand-deep text-white p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-brand-lime uppercase tracking-wide mb-3">
                    <Zap size={14} className="text-brand-lime" />
                    B-Well Clinical Protocol:
                  </div>
                  <ul className="space-y-2 text-xs font-medium text-slate-200">
                    {currentRegion.recommendedTreatments.map((treat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check size={14} className="text-brand-lime shrink-0 mt-0.5" />
                        <span>{treat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 pt-5 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Sparkles size={14} className="text-brand" />
                  <span>Includes initial 25-minute biomechanical evaluation</span>
                </div>
                <button
                  onClick={() => onOpenBooking(undefined, currentRegion.name)}
                  className="btn-primary"
                >
                  <Calendar size={16} />
                  <span>Book {currentRegion.name} Consult</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
