"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown, Sparkles } from "lucide-react";

interface FAQItem {
  id: string;
  category: "all" | "visit" | "cost" | "treatment";
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: "f1",
    category: "visit",
    question: "What happens at my first visit?",
    answer:
      "The physiotherapist takes your history, examines the painful area and tests your movement, then explains what they think is going on and what treatment would involve. Wear loose, comfortable clothing, and bring any X-rays, MRI films or reports you already have.",
  },
  {
    id: "f2",
    category: "visit",
    question: "When is the clinic open, and do I need an appointment?",
    answer:
      "Consultations run in the morning (8:00 am - 1:00 pm) and again in the evening (4:30 pm - 9:00 pm). Walk-ins are seen when there is a gap, but calling ahead means you are not waiting. Please call to confirm Sunday and public-holiday timings.",
  },
  {
    id: "f3",
    category: "visit",
    question: "Where exactly is the clinic?",
    answer:
      "Shop No. 8, Plot No. 4, near Amber Showroom, District Centre, Chandrasekharpur, Bhubaneswar 751016. The Visit Us section on this page has a map and a directions link.",
  },
  {
    id: "f4",
    category: "treatment",
    question: "Does physiotherapy hurt?",
    answer:
      "Treatment should not be painful. Some techniques leave you feeling worked, the way you would after unfamiliar exercise, and stiff joints can be tender when they are first moved. Sharp pain is a signal to stop, so tell your physiotherapist immediately if you feel it.",
  },
  {
    id: "f5",
    category: "treatment",
    question: "How many sessions will I need?",
    answer:
      "That depends on the condition, how long you have had it and how you respond, so it is decided after the assessment, not before. You are given a written session-by-session plan once treatment starts, and it is reviewed as you progress rather than fixed in advance.",
  },
  {
    id: "f6",
    category: "cost",
    question: "What does it cost, and will I get a receipt?",
    answer:
      "The fee for your assessment and for the treatment plan is explained to you before anything starts. Every payment gets an itemised, serially numbered receipt showing what you paid for, which is what you would need if you are claiming reimbursement.",
  },
  {
    id: "f7",
    category: "cost",
    question: "Can I follow my treatment plan between visits?",
    answer:
      "Yes. Register at the clinic and you can sign in to the patient portal to see your treatment plan, which sessions have been completed and what is scheduled next.",
  },
];

export default function FAQSection() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [openFaqId, setOpenFaqId] = useState<string | null>("f1");

  const filteredFaqs =
    activeCategory === "all"
      ? FAQS
      : FAQS.filter((f) => f.category === activeCategory);

  return (
    <section id="faq" className="py-20 bg-slate-50 relative">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/8 px-3.5 py-1 text-xs font-bold text-brand uppercase tracking-wider">
            <HelpCircle size={14} className="text-brand" />
            Patient Help Center
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Have questions before your visit? Find clear answers regarding treatments, costs, and appointments.
          </p>
        </div>

        {/* Category Filters */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {[
            { id: "all", label: "All Questions" },
            { id: "visit", label: "Visiting the clinic" },
            { id: "cost", label: "Fees & Records" },
            { id: "treatment", label: "Treatment & recovery" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                activeCategory === cat.id
                  ? "bg-brand text-white shadow-md shadow-brand/20"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Accordion */}
        <div className="mt-10 space-y-3">
          {filteredFaqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <div
                key={faq.id}
                className="card overflow-hidden transition-all duration-200 bg-white border border-slate-200"
              >
                <button
                  onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  className="w-full text-left p-5 flex items-center justify-between gap-4 font-bold text-slate-900 hover:text-brand transition"
                >
                  <span className="text-sm sm:text-base">{faq.question}</span>
                  <ChevronDown
                    size={18}
                    className={`transition-transform duration-200 text-slate-400 shrink-0 ${
                      isOpen ? "rotate-180 text-brand" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3 animate-in fade-in duration-150">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
