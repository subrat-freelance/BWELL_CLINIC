import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { CLINIC, addressLine } from "@/lib/clinic";

const [primaryPhone, secondaryPhone] = CLINIC.phones;

/* Display face for headings only. Everything functional — labels, buttons, body,
   form text — stays on the system sans, because that is what stays readable for
   the patients this clinic actually sees. */
const display = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${CLINIC.name} — ${CLINIC.address.line2}, ${CLINIC.address.city}`,
  description:
    `Physiotherapy clinic in ${CLINIC.address.line2}, ${CLINIC.address.city}, specialising in ` +
    `${CLINIC.specialities.join(", ").toLowerCase()}. Consultations ` +
    `${CLINIC.hours.map((h) => `${h.label.toLowerCase()} ${h.time}`).join(" and ")}. ` +
    `Call +91 ${primaryPhone}.`,
  keywords: [
    "physiotherapy clinic bhubaneswar",
    "physiotherapist chandrasekharpur",
    "district centre chandrasekharpur physiotherapy",
    "back pain treatment bhubaneswar",
    "joint pain physiotherapy odisha",
    "paralysis rehabilitation bhubaneswar",
    "paediatric physiotherapy bhubaneswar",
  ],
  authors: [{ name: CLINIC.name }],
  openGraph: {
    title: `${CLINIC.name}, ${CLINIC.address.line2}`,
    description: `${CLINIC.tagline}. ${CLINIC.category} in ${CLINIC.address.line2}, ${CLINIC.address.city}.`,
    siteName: CLINIC.name,
    locale: "en_IN",
    type: "website",
  },
  robots: { index: true, follow: true },
};

/**
 * Structured data for the Google listing. Every value here is taken from the
 * clinic's own Google Business profile or its signboard.
 *
 * There is deliberately no aggregateRating: review counts belong to Google, and
 * a review count the site invents for itself is a structured-data violation that
 * gets the listing penalised, not a marketing flourish.
 *
 * The one inference is the day range on the opening hours — the clinic publishes
 * the two daily consultation windows but not which days, so Monday to Saturday
 * is assumed. Correct it here if the clinic says otherwise.
 */
const jsonLdSchema = {
  "@context": "https://schema.org",
  "@type": "Physiotherapy",
  name: CLINIC.name,
  slogan: CLINIC.tagline,
  telephone: [`+91${primaryPhone}`, `+91${secondaryPhone}`],
  address: {
    "@type": "PostalAddress",
    streetAddress: `${CLINIC.address.line1}, ${CLINIC.address.line2}`,
    addressLocality: CLINIC.address.city,
    addressRegion: CLINIC.address.state,
    postalCode: CLINIC.address.pin,
    addressCountry: "IN",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: CLINIC.google.lat,
    longitude: CLINIC.google.lng,
  },
  hasMap: CLINIC.google.listing,
  openingHoursSpecification: [
    { opens: "08:00", closes: "13:00" },
    { opens: "16:30", closes: "21:00" },
  ].map((window) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    ...window,
  })),
  medicalSpecialty: "Physiotherapy",
  availableService: CLINIC.specialities.map((speciality) => ({
    "@type": "MedicalTherapy",
    name: `${speciality} physiotherapy`,
  })),
  employee: CLINIC.physios.map((doc) => ({
    "@type": "Person",
    name: doc.name,
    jobTitle: "Physiotherapist",
    alumniOf: doc.institute,
  })),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <head>
        <meta name="geo.position" content={`${CLINIC.google.lat};${CLINIC.google.lng}`} />
        <meta name="geo.placename" content={addressLine} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
