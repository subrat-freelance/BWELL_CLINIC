import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bwellphysio-bbsr.in";

// Search engines may index the public marketing site, but never the console,
// patient portal, login/registration or printable documents.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/portal", "/login", "/register", "/recover", "/print", "/api"],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
