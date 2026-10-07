import type { NextConfig } from "next";

// Vilka sajter som får visa hjälpen i en panel (iframe), t.ex. https://app.lupnumber.com.
const frameAncestors = ["'self'", ...(process.env.HELP_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];

const nextConfig: NextConfig = {
  // PGlite levereras som WASM och ska inte paketeras av Next.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        source: "/((?!api/).*)",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors.join(" ")}` },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Admin ska aldrig bäddas in någon annanstans.
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
