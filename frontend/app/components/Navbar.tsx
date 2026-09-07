"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Phone,
  Clock,
  MapPin,
  Menu,
  X,
  User,
  UserPlus,
  LayoutDashboard,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { CLINIC, addressLine, spaced, telHref } from "@/lib/clinic";

interface NavbarProps {
  onOpenBooking: (doctorName?: string, serviceName?: string) => void;
}

const [primaryPhone, secondaryPhone] = CLINIC.phones;

export default function Navbar({ onOpenBooking }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [portalDropdownOpen, setPortalDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full transition-all duration-300">
      {/* Top banner — phone, address and timings exactly as the clinic publishes them */}
      <div className="bg-brand-deep px-4 py-2 text-xs text-slate-300 sm:px-6 border-b border-white/15">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-6">
            <a
              href={telHref(primaryPhone)}
              className="flex items-center gap-1.5 font-bold text-brand-lime hover:text-white transition"
            >
              <Phone size={14} className="text-brand-lime" />
              <span>+91 {spaced(primaryPhone)}</span>
              <span className="hidden sm:inline text-slate-500 font-normal">
                | {spaced(secondaryPhone)}
              </span>
            </a>
            <span className="hidden items-center gap-1.5 md:flex text-slate-300">
              <MapPin size={13} className="text-brand-lime" />
              <span>
                {CLINIC.address.line2}, {CLINIC.address.city} {CLINIC.address.pin}
              </span>
            </span>
            <span className="hidden items-center gap-1.5 lg:flex text-slate-400">
              <Clock size={13} className="text-brand-lime" />
              <span>
                {CLINIC.hours.map((h) => h.time).join(" · ")}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Portal Dropdown */}
            <div className="relative">
              <button
                onClick={() => setPortalDropdownOpen(!portalDropdownOpen)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-brand-lime transition"
              >
                <span>Clinic Portals</span>
                <ChevronDown size={12} />
              </button>
              {portalDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-white/25 bg-brand-deep p-2 shadow-2xl z-50"
                  onMouseLeave={() => setPortalDropdownOpen(false)}
                >
                  <Link
                    href="/login"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-brand-lime transition"
                    onClick={() => setPortalDropdownOpen(false)}
                  >
                    <User size={14} className="text-brand-lime" />
                    <div>
                      <div className="font-semibold">Patient Portal Login</div>
                      <div className="text-[10px] text-slate-400">View treatment roadmap & queue</div>
                    </div>
                  </Link>
                  <div className="my-1 border-t border-white/15" />
                  <Link
                    href="/admin"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-brand-lime transition"
                    onClick={() => setPortalDropdownOpen(false)}
                  >
                    <LayoutDashboard size={14} className="text-amber-400" />
                    <div>
                      <div className="font-semibold">Clinic Admin Dashboard</div>
                      <div className="text-[10px] text-slate-400">Patient queue & session tracking</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Nav */}
      <nav
        className={`w-full transition-all duration-300 ${
          isScrolled
            ? "bg-white/95 backdrop-blur-md shadow-md py-3 border-b border-slate-200/80"
            : "bg-white py-4 border-b border-slate-100"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* The clinic's own mark, taken from its signboard */}
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo-mark.png"
              alt=""
              width={512}
              height={512}
              className="h-11 w-11 shrink-0 transition-transform group-hover:scale-105"
              priority
            />
            <div>
              <Image
                src="/logo-wordmark.png"
                alt={CLINIC.name}
                width={284}
                height={103}
                className="h-7 w-auto"
                priority
              />
              <span className="mt-0.5 block whitespace-nowrap text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                {CLINIC.address.line2.split(", ")[1]}, {CLINIC.address.city}
              </span>
            </div>
          </Link>

          {/* Desktop Links */}
          <div className="hidden items-center gap-5 lg:flex">
            <a href="#pain-navigator" className="whitespace-nowrap text-[13px] font-semibold text-slate-600 hover:text-brand transition">
              Pain Assessment
            </a>
            <a href="#services" className="whitespace-nowrap text-[13px] font-semibold text-slate-600 hover:text-brand transition">
              Treatments
            </a>
            <a href="#estimator" className="whitespace-nowrap text-[13px] font-semibold text-slate-600 hover:text-brand transition">
              Recovery Estimator
            </a>
            <a href="#doctors" className="whitespace-nowrap text-[13px] font-semibold text-slate-600 hover:text-brand transition">
              Our Physiotherapists
            </a>
            <a href="#visit" className="whitespace-nowrap text-[13px] font-semibold text-slate-600 hover:text-brand transition">
              Visit Us
            </a>
            <a href="#faq" className="whitespace-nowrap text-[13px] font-semibold text-slate-600 hover:text-brand transition">
              FAQ
            </a>
          </div>

          {/* Desktop Action CTAs */}
          <div className="hidden items-center gap-3 lg:flex">
            <a
              href={telHref(primaryPhone)}
              className="hidden xl:inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-800 transition hover:bg-slate-50"
            >
              <Phone size={14} className="text-brand" />
              <span>Call +91 {spaced(primaryPhone)}</span>
            </a>
            <button onClick={() => onOpenBooking()} className="btn-primary whitespace-nowrap">
              <Calendar size={16} />
              <span>Request an appointment</span>
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-xl p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-white px-4 pb-6 pt-4 lg:hidden shadow-xl animate-in slide-in-from-top duration-200">
            <div className="flex flex-col gap-3">
              {[
                { href: "#pain-navigator", label: "Body Pain Assessment" },
                { href: "#services", label: "Treatments" },
                { href: "#estimator", label: "Recovery Estimator" },
                { href: "#doctors", label: "Our Physiotherapists" },
                { href: "#visit", label: "Visit Us" },
                { href: "#faq", label: "FAQ" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-brand/5 hover:text-brand"
                >
                  {item.label}
                </a>
              ))}

              <div className="my-2 border-t border-slate-100 pt-3">
                <a
                  href={telHref(primaryPhone)}
                  className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-xs font-extrabold text-slate-900"
                >
                  <Phone size={15} className="text-brand" />
                  <span>Call +91 {spaced(primaryPhone)}</span>
                </a>
                <a
                  href={telHref(secondaryPhone)}
                  className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-xs font-extrabold text-slate-900"
                >
                  <Phone size={15} className="text-brand" />
                  <span>Call +91 {spaced(secondaryPhone)}</span>
                </a>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenBooking();
                  }}
                  className="btn-primary w-full py-3"
                >
                  <Calendar size={16} />
                  <span>Request an appointment</span>
                </button>
                <p className="mt-3 px-1 text-[11px] leading-relaxed text-slate-500">{addressLine}</p>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
