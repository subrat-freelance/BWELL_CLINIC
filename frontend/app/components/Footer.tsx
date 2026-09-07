"use client";

import Image from "next/image";
import Link from "next/link";
import { Phone, Clock, MapPin, ArrowUp, Star } from "lucide-react";
import { CLINIC, addressLine, spaced, telHref } from "@/lib/clinic";

export default function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-brand-deep text-slate-400 text-xs border-t border-white/15 relative">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <Image
                src="/logo-mark.png"
                alt=""
                width={512}
                height={512}
                className="h-10 w-10 shrink-0"
              />
              <div>
                <span className="text-xl font-extrabold text-white tracking-tight block">
                  B-WELL <span className="text-brand-lime font-light">CLINIC</span>
                </span>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                  {CLINIC.address.line2}, {CLINIC.address.city}
                </span>
              </div>
            </div>
            <p className="text-slate-400 leading-relaxed max-w-sm italic">
              &ldquo;{CLINIC.tagline}.&rdquo;
            </p>
            <p className="text-slate-400 leading-relaxed max-w-sm">
              {CLINIC.category} specialising in {CLINIC.specialities.join(", ").toLowerCase()}.
            </p>
            <a
              href={CLINIC.google.listing}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300 hover:text-amber-200"
            >
              <Star size={13} className="fill-amber-400 text-amber-400" />
              <span>Rated {CLINIC.google.rating.toFixed(1)} on Google</span>
            </a>
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Quick Navigation
            </h4>
            <ul className="space-y-2 font-medium">
              {[
                { href: "#pain-navigator", label: "Pain Assessment" },
                { href: "#services", label: "Treatments" },
                { href: "#estimator", label: "Recovery Estimator" },
                { href: "#doctors", label: "Our Physiotherapists" },
                { href: "#visit", label: "Visit Us" },
                { href: "#faq", label: "FAQ" },
              ].map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="hover:text-brand-lime transition">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Clinic Digital Portals */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Clinic Systems
            </h4>
            <ul className="space-y-2.5">
              {[
                {
                  href: "/login",
                  dot: "bg-brand-lime",
                  hover: "hover:text-brand-lime hover:border-brand-mid/40",
                  title: "Patient Portal Login",
                  sub: "View treatment roadmap & queue",
                },
                {
                  href: "/admin",
                  dot: "bg-amber-400",
                  hover: "hover:text-amber-400 hover:border-amber-500/40",
                  title: "Clinic Admin Panel",
                  sub: "Queue & session management",
                },
              ].map((portal) => (
                <li key={portal.href}>
                  <Link
                    href={portal.href}
                    className={`inline-flex items-center gap-2 rounded-lg bg-brand-deep border border-white/15 px-3 py-2 text-slate-200 transition w-full ${portal.hover}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${portal.dot}`} />
                    <div>
                      <div className="font-bold">{portal.title}</div>
                      <div className="text-[10px] text-slate-400">{portal.sub}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Clinic Location & Contact
            </h4>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-2.5">
                <MapPin size={16} className="text-brand-lime shrink-0 mt-0.5" />
                <span>{addressLine}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone size={16} className="text-brand-lime shrink-0 mt-0.5" />
                <div className="font-semibold">
                  {CLINIC.phones.map((phone) => (
                    <a key={phone} href={telHref(phone)} className="hover:text-brand-lime block">
                      +91 {spaced(phone)}
                    </a>
                  ))}
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock size={16} className="text-brand-lime shrink-0 mt-0.5" />
                <div>
                  {CLINIC.hours.map((slot) => (
                    <div key={slot.label}>
                      {slot.label}: {slot.time}
                    </div>
                  ))}
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/15 bg-brand-deep/80 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <p>
            © {new Date().getFullYear()} {CLINIC.name}, {CLINIC.address.line2}. All rights
            reserved.
          </p>

          <button
            onClick={scrollToTop}
            className="flex items-center gap-1.5 rounded-lg bg-brand-deep border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:text-brand-lime transition"
          >
            <span>Back to top</span>
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </footer>
  );
}
