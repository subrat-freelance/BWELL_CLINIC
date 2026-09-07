"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { CLINIC, addressLine, availablePhysios, spaced, telHref, waHref } from "@/lib/clinic";
import { api, apiError } from "@/lib/api";

/**
 * An appointment REQUEST, not a booking.
 *
 * The request is recorded on the clinic's own callback board (Admin -> Inquiries)
 * so it survives the evening and the front desk can see who still needs ringing,
 * and it is *also* handed to WhatsApp, because a message on the phone in someone's
 * pocket is what actually gets read. Neither confirms anything: a patient told
 * "slot reserved" will travel to a clinic that has never heard of them.
 */

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDoctor?: string;
  defaultService?: string;
}

const [primaryPhone, secondaryPhone] = CLINIC.phones;

const ANY_PHYSIO = "First available physiotherapist";

/** Only slots inside the clinic's published morning and evening consultation hours. */
const SLOTS = [
  "8:00 am (morning)",
  "9:00 am (morning)",
  "10:00 am (morning)",
  "11:00 am (morning)",
  "12:00 noon (morning)",
  "4:30 pm (evening)",
  "5:30 pm (evening)",
  "6:30 pm (evening)",
  "7:30 pm (evening)",
  "8:30 pm (evening)",
];

export default function BookingModal({
  isOpen,
  onClose,
  defaultDoctor = "",
  defaultService = "",
}: BookingModalProps) {
  const [formData, setFormData] = useState({
    patientName: "",
    phone: "",
    doctor: defaultDoctor || ANY_PHYSIO,
    service: defaultService || "General assessment",
    preferredDate: new Date().toISOString().split("T")[0],
    preferredTime: SLOTS[2],
    symptoms: "",
  });

  const [isSent, setIsSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState("");
  const [waOpened, setWaOpened] = useState(false);

  if (!isOpen) return null;

  const message = [
    `Appointment request — ${CLINIC.name}`,
    "",
    `Name: ${formData.patientName}`,
    `Phone: ${formData.phone}`,
    `For: ${formData.service}`,
    `Physiotherapist: ${formData.doctor}`,
    `Preferred: ${formData.preferredDate}, ${formData.preferredTime}`,
    formData.symptoms ? `Symptoms: ${formData.symptoms}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setFailed("");
    // Open the WhatsApp tab from inside the click, before any await — a popup
    // opened after one is blocked in Safari and Firefox.
    const wa = window.open(waHref(primaryPhone, message), "_blank", "noopener,noreferrer");
    setWaOpened(Boolean(wa));
    try {
      await api.post("/inquiries", {
        full_name: formData.patientName,
        phone_number: formData.phone,
        reason: formData.service,
        preferred_physio: formData.doctor,
        preferred_date: formData.preferredDate,
        preferred_slot: formData.preferredTime,
        symptoms: formData.symptoms || null,
      });
      setIsSent(true);
    } catch (err) {
      // The clinic's board did not get it. Say so rather than showing a tick —
      // the WhatsApp tab may have been blocked too, and then nobody has been told.
      setFailed(apiError(err, "We could not reach the clinic's system just now."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {!isSent ? (
          <div>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
              <Image
                src="/logo-mark.png"
                alt=""
                width={512}
                height={512}
                className="h-12 w-12 shrink-0"
              />
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  Request an appointment
                </h3>
                <p className="text-xs text-slate-500">
                  Sent to the clinic on WhatsApp — reception confirms the time with you.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Patient full name *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={formData.patientName}
                    onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                    className="input pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="label">Your 10-digit mobile number *</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    placeholder="10-digit mobile number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input pl-9"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  The clinic calls this number back to confirm your slot.
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Preferred physiotherapist</label>
                  <select
                    value={formData.doctor}
                    onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                    className="input text-xs font-semibold text-slate-800"
                  >
                    <option>{ANY_PHYSIO}</option>
                    {availablePhysios.map((doc) => (
                      <option key={doc.name}>{doc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">What is it for?</label>
                  <select
                    value={formData.service}
                    onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                    className="input text-xs font-semibold text-slate-800"
                  >
                    <option>General assessment</option>
                    {CLINIC.specialities.map((speciality) => (
                      <option key={speciality}>{speciality}</option>
                    ))}
                    <option>Post-surgical rehabilitation</option>
                    <option>Something else</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Preferred date</label>
                  <div className="relative">
                    <Calendar size={16} className="absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().split("T")[0]}
                      value={formData.preferredDate}
                      onChange={(e) => setFormData({ ...formData, preferredDate: e.target.value })}
                      className="input pl-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Preferred time</label>
                  <div className="relative">
                    <Clock size={16} className="absolute left-3 top-3.5 text-slate-400" />
                    <select
                      value={formData.preferredTime}
                      onChange={(e) => setFormData({ ...formData, preferredTime: e.target.value })}
                      className="input pl-9 text-xs font-semibold"
                    >
                      {SLOTS.map((slot) => (
                        <option key={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Where does it hurt, and for how long? (optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. lower back pain going down the right leg, about two weeks"
                  value={formData.symptoms}
                  onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div className="pt-2 space-y-2">
                {failed && (
                  <p
                    role="alert"
                    className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-800"
                  >
                    {failed} Please call the clinic on{" "}
                    <a href={telHref(primaryPhone)} className="font-bold underline">
                      +91 {spaced(primaryPhone)}
                    </a>{" "}
                    instead.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="btn-primary w-full py-3.5 text-base disabled:opacity-60"
                >
                  <MessageCircle size={18} />
                  <span>{sending ? "Sending…" : "Send request to the clinic"}</span>
                </button>
                <a
                  href={telHref(primaryPhone)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-xs font-extrabold text-slate-800 transition hover:bg-slate-50"
                >
                  <Phone size={15} className="text-brand" />
                  <span>Or call +91 {spaced(primaryPhone)}</span>
                </a>
                <p className="text-center text-[10px] leading-relaxed text-slate-400">
                  This sends a request. Your appointment is not booked until the clinic
                  confirms it with you.
                </p>
              </div>
            </form>
          </div>
        ) : (
          /* HANDOFF SCREEN — a request was sent, nothing is booked */
          <div className="py-4 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-olive/12 text-brand-olive mb-4">
              <CheckCircle2 size={36} />
            </div>

            <h3 className="text-center text-2xl font-extrabold text-slate-900">
              Your request is ready to send
            </h3>
            <p className="mt-2 text-center text-sm text-slate-600">
              The clinic has your details and will call you back to confirm a time.
              {waOpened
                ? " A WhatsApp message has also opened with the same details — press send there if you would like it on their phone too."
                : ""}
            </p>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
              <strong>Nothing is booked yet.</strong> {CLINIC.name} confirms every
              appointment by phone. If you do not hear back, call the clinic directly.
            </div>

            <div className="mt-4 space-y-2">
              {[primaryPhone, secondaryPhone].map((phone) => (
                <a
                  key={phone}
                  href={telHref(phone)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-xs font-extrabold text-slate-800 transition hover:bg-slate-50"
                >
                  <Phone size={15} className="text-brand" />
                  <span>Call +91 {spaced(phone)}</span>
                </a>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 border border-slate-200 text-left space-y-2 text-xs">
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2">
                <span className="text-slate-500">Requested for</span>
                <span className="font-bold text-slate-900 text-right">
                  {formData.preferredDate}, {formData.preferredTime}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Clinic</span>
                <span className="font-bold text-slate-900 text-right">{addressLine}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setIsSent(false);
                onClose();
              }}
              className="mt-5 w-full rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
