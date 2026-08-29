import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Security Headers
// Implements all headers documented in docs/frontend-security-headers.md
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  // Prevents XSS and data injection attacks.
  // - unsafe-inline required for Next.js hydration and Tailwind CSS
  // - unsafe-eval required for Next.js development mode hot reloading
  // - connect-src allows Stellar Horizon and Soroban RPC endpoints
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      [
        "connect-src 'self'",
        "https://horizon.stellar.org",
        "https://horizon-testnet.stellar.org",
        "https://soroban-rpc.stellar.org",
        "https://soroban-testnet.stellar.org",
        isDev ? "ws://localhost:*" : "",
      ]
        .filter(Boolean)
        .join(" "),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },

  // Prevents MIME type sniffing — browsers must respect declared Content-Type.
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },

  // Prevents clickjacking by disallowing this page from being framed.
  // Redundant with frame-ancestors in CSP but kept for older browser support.
  {
    key: "X-Frame-Options",
    value: "DENY",
  },

  // Controls how much referrer information is sent with requests.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },

  // Disables browser features not used by this app.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },

  // Forces HTTPS in production. Not applied in development to avoid
  // breaking local http:// dev server.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, ".."),

  experimental: {
    optimizePackageImports: ["lucide-react", "@stellar/stellar-sdk"],
  },

  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error", "warn"],
          }
        : false,
  },

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96],
  },

  poweredByHeader: false,
  compress: true,

  // Apply security headers to every route.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
