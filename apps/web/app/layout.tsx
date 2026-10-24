import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Bodoni_Moda, IBM_Plex_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const serif = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

// Police du site public (landing, pages légales, espace recruteur). Le back-office garde Inter et Plex Mono.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: {
    default: "Sapios Emploi — Recrutement à l’aveugle, diplôme vérifié",
    template: "%s — Sapios Emploi",
  },
  description:
    "Sapios Emploi : des offres avec salaire affiché et vraies photos du lieu de travail, des CV anonymes jusqu’au match, des diplômes vérifiés et une réponse garantie. Gratuit pour les candidats.",
  applicationName: "Sapios Emploi",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Sapios Emploi",
    title: "Recrutement à l’aveugle, diplôme vérifié.",
    description: "Salaire affiché, CV sans photo, réponse garantie. Gratuit pour les candidats.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "dark light",
};

// Ajoute la classe `js` avant le premier rendu : les styles d'animation n'existent qu'avec JavaScript.
const bootScript = "document.documentElement.classList.add('js')";

// Le nonce de la CSP (proxy.ts) : lire les en-têtes rend chaque page à la demande, condition pour que
// Next.js pose le nonce sur ses propres scripts.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="fr"
      className={`${serif.variable} ${sans.variable} ${mono.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
