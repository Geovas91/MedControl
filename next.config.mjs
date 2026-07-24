/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" }
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }

    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/consent/sign/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }
        ]
      },
      {
        source: "/invite/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }
        ]
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, max-age=0" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }]
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ];
  }
};

export default nextConfig;
