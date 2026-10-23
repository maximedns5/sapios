import type { NextConfig } from "next";

// En-têtes de sécurité sur toutes les réponses, fichiers statiques compris. La CSP, elle, est posée
// par proxy.ts (un nonce par requête).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@sapios/shared"],
  poweredByHeader: false,
  agentRules: false,
  // Pages légales rendues à chaque requête (nonce de la CSP) : leurs textes doivent suivre au déploiement.
  outputFileTracingIncludes: {
    "/cgu": ["./content/legal/**"],
    "/mentions-legales": ["./content/legal/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
