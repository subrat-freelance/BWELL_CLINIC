"use client";

import { Phone, Calendar, MessageCircle } from "lucide-react";
import { CLINIC, telHref, waHref } from "@/lib/clinic";

interface FloatingActionsProps {
  onOpenBooking: () => void;
}

const [primaryPhone] = CLINIC.phones;

export default function FloatingActions({ onOpenBooking }: FloatingActionsProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-auto">
      <a
        href={waHref(
          primaryPhone,
          `Hi ${CLINIC.name}, I would like to ask about a physiotherapy consultation.`,
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-110 hover:bg-[#1EBE5A]"
        title="Chat on WhatsApp"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle size={24} />
      </a>

      <a
        href={telHref(primaryPhone)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-deep text-brand-lime border border-white/25 shadow-lg transition hover:scale-110 hover:bg-white/10"
        title="Call the clinic"
        aria-label="Call the clinic"
      >
        <Phone size={20} />
      </a>

      <button
        onClick={onOpenBooking}
        className="btn-primary py-3 px-5 shadow-2xl shadow-brand/40 flex items-center gap-2 text-sm"
      >
        <Calendar size={18} />
        <span className="font-bold">Request appointment</span>
      </button>
    </div>
  );
}
