"use client";

import { useState } from "react";
import Navbar from "./components/Navbar";
import HeroSection from "./components/HeroSection";
import SpecialitiesBar from "./components/SpecialitiesBar";
import PainNavigator from "./components/PainNavigator";
import ServicesGrid from "./components/ServicesGrid";
import RecoveryEstimator from "./components/RecoveryEstimator";
import DoctorTeam from "./components/DoctorTeam";
import VisitSection from "./components/VisitSection";
import FAQSection from "./components/FAQSection";
import Footer from "./components/Footer";
import FloatingActions from "./components/FloatingActions";
import BookingModal from "./components/BookingModal";

export default function Home() {
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<string | undefined>(undefined);
  const [selectedService, setSelectedService] = useState<string | undefined>(undefined);

  const handleOpenBooking = (doctorName?: string, serviceName?: string) => {
    setSelectedDoctor(doctorName);
    setSelectedService(serviceName);
    setBookingModalOpen(true);
  };

  const handleCloseBooking = () => {
    setBookingModalOpen(false);
    setSelectedDoctor(undefined);
    setSelectedService(undefined);
  };

  return (
    <div className="site flex min-h-screen flex-col">
      {/* Navigation Header */}
      <Navbar onOpenBooking={handleOpenBooking} />

      {/* Main Landing Page Flow */}
      <main className="flex-grow">
        {/* 1. Problem-First Hero Section with Live Metrics & Dual CTAs */}
        <HeroSection onOpenBooking={handleOpenBooking} />

        {/* 2. The clinic's own specialities, from its signboard */}
        <SpecialitiesBar />

        {/* 3. Interactive Anatomical Body Pain Assessment */}
        <PainNavigator onOpenBooking={handleOpenBooking} />

        {/* 4. Specialized Care Programs & Technology Showcase */}
        <ServicesGrid onOpenBooking={handleOpenBooking} />

        {/* 5. AI-Assisted Recovery Duration Estimator */}
        <RecoveryEstimator onOpenBooking={handleOpenBooking} />

        {/* 6. The physiotherapists named on the clinic signboard */}
        <DoctorTeam onOpenBooking={handleOpenBooking} />

        {/* 7. Address, map, timings and phone numbers */}
        <VisitSection />

        {/* 8. Searchable FAQ Accordion */}
        <FAQSection />
      </main>

      {/* Footer */}
      <Footer />

      {/* Floating WhatsApp & Call Buttons */}
      <FloatingActions onOpenBooking={() => handleOpenBooking()} />

      {/* Instant Appointment Booking Modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={handleCloseBooking}
        defaultDoctor={selectedDoctor}
        defaultService={selectedService}
      />
    </div>
  );
}
