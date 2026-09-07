"use client";

import { useState } from "react";
import {
  Activity,
  Shield,
  Zap,
  HeartPulse,
  Flame,
  UserCheck,
  CheckCircle2,
  Calendar,
  Info,
  ChevronRight,
  X,
} from "lucide-react";

interface ServiceItem {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: any;
  technologies: string[];
  idealFor: string[];
  duration: string;
  sessions: string;
  modalDetails: string;
}

const SERVICES: ServiceItem[] = [
  {
    id: "ortho",
    title: "Orthopedic & Spine Rehabilitation",
    category: "Spine & Joint Care",
    description:
      "Targeted treatment for disc prolapse, cervical spondylosis, osteoarthritis, frozen shoulder, and chronic lower back pain.",
    icon: Activity,
    technologies: ["Spinal Decompression Table", "Class-IV Laser", "Manual Mobilization"],
    idealFor: ["Sciatica Patients", "Chronic Back Pain", "Stiff Joints", "Spondylosis"],
    duration: "45 Mins / Session",
    sessions: "5 - 10 Sessions",
    modalDetails:
      "Combines computerized spinal traction with high-intensity laser therapy to reduce nerve swelling and re-align misaligned vertebrae.",
  },
  {
    id: "sports",
    title: "Sports Injury & Athletic Recovery",
    category: "Sports Medicine",
    description:
      "Accelerated recovery for ACL tears, rotator cuff injury, tennis elbow, hamstring strains, and runner's knee.",
    icon: Flame,
    technologies: ["Radial Shockwave Therapy", "Myofascial Dry Needling", "Kinesio Taping"],
    idealFor: ["Athletes & Runners", "Ligament Tears", "Tendonitis", "Muscle Strain"],
    duration: "60 Mins / Session",
    sessions: "4 - 8 Sessions",
    modalDetails:
      "Uses high-energy acoustic soundwaves to break down scar tissue and trigger rapid capillary neo-vascularization for fast return-to-sport.",
  },
  {
    id: "neuro",
    title: "Neurological Physical Therapy",
    category: "Neuro Rehabilitation",
    description:
      "Specialized motor retraining for post-stroke recovery, Parkinson's disease, nerve paralysis, and vestibular balance disorders.",
    icon: HeartPulse,
    technologies: ["Neuromuscular Electrical Stimulation (NMES)", "Balance & Gait Platform"],
    idealFor: ["Stroke Patients", "Facial Palsy", "Parkinson’s", "Balance Loss"],
    duration: "50 Mins / Session",
    sessions: "12 - 20 Sessions",
    modalDetails:
      "Neuro-plasticity focused therapy that re-trains brain signals to control dormant motor pathways, improving independent walking.",
  },
  {
    id: "postop",
    title: "Post-Surgical Rehabilitation",
    category: "Post-Op Care",
    description:
      "Structured recovery pathways for Total Knee Replacement (TKR), Total Hip Replacement (THR), and Arthroscopic surgeries.",
    icon: Shield,
    technologies: ["Continuous Passive Motion (CPM)", "Cryo-Thermal Contrast", "Lymphatic Drainage"],
    idealFor: ["Post Knee Replacement", "Fracture Recovery", "Spine Fusion Post-Op"],
    duration: "45 Mins / Session",
    sessions: "10 - 15 Sessions",
    modalDetails:
      "Safe, physician-coordinated passive range-of-motion protocol designed to prevent scar tissue contracture and restore full gait.",
  },
  {
    id: "geriatric",
    title: "Geriatric Mobility & Balance Care",
    category: "Senior Care",
    description:
      "Gentle physical therapy tailored for seniors to rebuild leg strength, improve gait balance, and prevent accidental falls.",
    icon: UserCheck,
    technologies: ["Low-Impact PEMF", "Proprioception Training", "Hydro-therapeutics"],
    idealFor: ["Senior Citizens", "Unsteady Gait", "Osteoporosis", "General Weakness"],
    duration: "40 Mins / Session",
    sessions: "6 - 12 Sessions",
    modalDetails:
      "Focuses on core stability, proprioception, and bone density preservation to ensure confidence in daily independent living.",
  },
  {
    id: "electro",
    title: "Advanced Electrotherapy & Laser",
    category: "Pain Technology",
    description:
      "Non-invasive pain-relief technology including Interferential Therapy (IFT), Ultrasonic soundwaves, and PEMF stimulation.",
    icon: Zap,
    technologies: ["Combo IFT & TENS", "Ultrasound Sonophoresis", "PEMF Bone Stimulator"],
    idealFor: ["Acute Nerve Pain", "Joint Swelling", "Deep Muscle Spasms"],
    duration: "30 Mins / Session",
    sessions: "3 - 6 Sessions",
    modalDetails:
      "Painless electrical frequency modulation blocks pain signals at the spinal cord level while accelerating tissue cellular ATP repair.",
  },
];

interface ServicesGridProps {
  onOpenBooking: (doctorName?: string, serviceName?: string) => void;
}

export default function ServicesGrid({ onOpenBooking }: ServicesGridProps) {
  const [selectedModalService, setSelectedModalService] = useState<ServiceItem | null>(null);

  return (
    <section id="services" className="py-20 bg-white relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-12 border-b border-slate-100">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/8 px-3.5 py-1 text-xs font-bold text-brand uppercase tracking-wider">
              <Zap size={14} className="text-brand" />
              Specialized Care Programs
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Treatments offered
            </h2>
            <p className="mt-2 text-base text-slate-600 max-w-2xl">
              Hands-on manual therapy, exercise-based rehabilitation and electrotherapy, chosen after an in-person assessment rather than from a menu.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Need custom therapy?</span>
            <button
              onClick={() => onOpenBooking()}
              className="btn-ghost text-xs py-2 px-4"
            >
              Consult Clinical Specialist
            </button>
          </div>
        </div>

        {/* Services Grid */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.id}
                className="card group flex flex-col justify-between p-6 hover:border-brand-mid hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative"
              >
                <div>
                  {/* Category Pill */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="rounded-md bg-brand/8 px-2.5 py-1 text-[11px] font-bold text-brand uppercase tracking-wider">
                      {service.category}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {service.duration}
                    </span>
                  </div>

                  {/* Icon & Title */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white shadow-md shadow-brand/20 group-hover:scale-110 transition-transform">
                      <Icon size={22} />
                    </div>
                    <h3 className="font-extrabold text-slate-900 text-lg group-hover:text-brand transition">
                      {service.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">
                    {service.description}
                  </p>

                  {/* Technology Tags */}
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase mb-2">
                      Key Technology Used:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {service.technologies.map((tech, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 mt-4">
                  <button
                    onClick={() => setSelectedModalService(service)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand"
                  >
                    <Info size={14} />
                    <span>How it works</span>
                  </button>

                  <button
                    onClick={() => onOpenBooking(undefined, service.title)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 hover:text-brand transition group-hover:translate-x-0.5"
                  >
                    <span>Book Service</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Technology Detail Modal */}
      {selectedModalService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200">
            <button
              onClick={() => setSelectedModalService(null)}
              className="absolute top-5 right-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white">
                <selectedModalService.icon size={26} />
              </div>
              <div>
                <span className="text-xs font-bold text-brand uppercase tracking-wider">
                  {selectedModalService.category}
                </span>
                <h3 className="text-xl font-extrabold text-slate-900">
                  {selectedModalService.title}
                </h3>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              {selectedModalService.modalDetails}
            </p>

            <div className="space-y-4 rounded-2xl bg-slate-50 p-4 border border-slate-200">
              <div className="text-xs font-bold text-slate-700 uppercase">Recommended For:</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {selectedModalService.idealFor.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-brand" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-400 block">Typical Duration</span>
                <span className="text-sm font-bold text-slate-800">
                  {selectedModalService.sessions} ({selectedModalService.duration})
                </span>
              </div>
              <button
                onClick={() => {
                  const title = selectedModalService.title;
                  setSelectedModalService(null);
                  onOpenBooking(undefined, title);
                }}
                className="btn-primary"
              >
                <Calendar size={16} />
                <span>Book This Therapy</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
