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

// Police du site public (landing, test, pages légales). Le back-office garde Inter et Plex Mono.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: {
    default: "Sapios — L’amour est aveugle. Nous, non.",
    template: "%s — Sapios",
  },
  description:
    "Sapios, l’application de rencontre pour les gens vraiment intelligents. Diplôme vérifié obligatoire. Réservé à 2 % de la population.",
  applicationName: "Sapios",
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
