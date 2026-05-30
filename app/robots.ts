import type { MetadataRoute } from "next";

/**
 * Allow the marketing + legal routes to be indexed; block the app/auth surface
 * and the API. Next generates /robots.txt from this at request time.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/account", "/signin", "/api/"],
      },
    ],
  };
}
