/**
 * The clinic's real, verified public details.
 *
 * Source: the clinic's own Google Business listing (B-WELL Physiotherapy Clinic,
 * District Centre, Chandrasekharpur) and the clinic signboard photographed on
 * that listing. Read 2026-09-04.
 *
 * Nothing in this file may be a guess. A physiotherapy clinic is a clinical
 * establishment: an invented registration number, council number, certification,
 * insurance tie-up or outcome statistic on its public site is a regulatory
 * problem, not a copywriting one. If a value is not on the listing or on the
 * signboard, it is not in here — leave it out until the clinic supplies it.
 *
 * This drives the public site. Printed clinical documents take their letterhead
 * from the Clinic row in the database instead (Admin → Settings → Letterhead),
 * because the owner has to be able to correct that without a deploy.
 */

export const CLINIC = {
  name: "B-WELL Physiotherapy Clinic",
  /** Verbatim from the signboard. */
  tagline: "Approach for a pain free and actively independent life",
  /** The category Google lists the practice under. */
  category: "Physiotherapy Center",
  /** Signboard: "Specialised in : Spine, Joint Pain, Paralysis and Paediatric". */
  specialities: ["Spine", "Joint pain", "Paralysis", "Paediatric"],

  address: {
    line1: "Shop No. 8, Plot No. 4, near Amber Showroom",
    line2: "District Centre, Chandrasekharpur",
    city: "Bhubaneswar",
    state: "Odisha",
    pin: "751016",
  },

  /** Both numbers are printed on the clinic's own signboard. */
  phones: ["7749940400", "8658271236"],

  /** Signboard: "Consultation Timing Morning : 8.00 AM - 1.00 PM / Evening : 4.30 PM - 9.00 PM". */
  hours: [
    { label: "Morning", time: "8:00 am – 1:00 pm" },
    { label: "Evening", time: "4:30 pm – 9:00 pm" },
  ],

  google: {
    rating: 5.0,
    plusCode: "8RC9+WX Bhubaneswar, Odisha",
    lat: 20.3223174,
    lng: 85.8199006,
    listing:
      "https://www.google.com/maps/place/B-WELL+Physiotherapy+Clinic/@20.3223174,85.8199006,17z/data=!4m6!3m5!1s0x3a19095316b308cb:0x681b3a83a5f237a9!8m2!3d20.3223174!4d85.8199006!16s%2Fg%2F11zhx58xr7",
  },

  /**
   * Named on the signboard, with the qualifications exactly as the clinic states them.
   *
   * `available` is who is taking patients right now. Someone unavailable stays listed
   * on the clinic's own card — the signboard names them and it would be odd to deny it
   * — but they are not offered anywhere a visitor can ask for an appointment.
   */
  physios: [
    {
      name: "Dr. Sanjay Kumar (PT)",
      initials: "SK",
      qualification: "BPT, MPT",
      institute: "SVNIRTAR, Olatpur",
      available: false,
      // No photo supplied for him yet; the card falls back to initials.
      photo: "",
    },
    {
      name: "Dr. Arun Kumar Maharana (PT)",
      initials: "AM",
      qualification: "BPT",
      institute: "Utkal University",
      available: true,
      photo: "/dr-arun-kumar-maharana.jpg",
    },
  ],
} as const;

/** "Shop No. 8, …, Chandrasekharpur, Bhubaneswar, Odisha 751016" */
export const addressLine = [
  CLINIC.address.line1,
  CLINIC.address.line2,
  `${CLINIC.address.city}, ${CLINIC.address.state} ${CLINIC.address.pin}`,
].join(", ");

/** "77499 40400" — how an Indian number is read aloud, not how it is dialled. */
export const spaced = (phone: string) => `${phone.slice(0, 5)} ${phone.slice(5)}`;

export const telHref = (phone: string) => `tel:+91${phone}`;

export const waHref = (phone: string, text: string) =>
  `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

/** Who can be asked for by name today. */
export const availablePhysios = CLINIC.physios.filter((p) => p.available);

export const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${CLINIC.google.lat},${CLINIC.google.lng}`;
