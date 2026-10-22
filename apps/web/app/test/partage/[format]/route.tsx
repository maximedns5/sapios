import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { QUIZ } from "@sapios/shared";
import { SITE_HOST } from "@/lib/site";

// Image à partager du test d'admission, en story (1080 × 1920) et en carré (1080 × 1080).
// Générée une fois au build : le résultat est le même pour tout le monde.

export const dynamic = "force-static";
export const dynamicParams = false;

const ACCENT = "#4338E0";
const GOLD = "#F2C14E";
const INK = "#1A1918";

const FORMATS = {
  story: { width: 1080, height: 1920 },
  carre: { width: 1080, height: 1080 },
} as const;
type Format = keyof typeof FORMATS;

export function generateStaticParams() {
  return Object.keys(FORMATS).map((format) => ({ format }));
}

async function loadFonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [medium, bold, extraBold, wordmark] = await Promise.all([
    readFile(join(dir, "PlusJakartaSans-Medium.ttf")),
    readFile(join(dir, "PlusJakartaSans-Bold.ttf")),
    readFile(join(dir, "PlusJakartaSans-ExtraBold.ttf")),
    readFile(join(dir, "BodoniModa-MediumItalic.ttf")),
  ]);
  return [
    { name: "Jakarta", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Jakarta", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Jakarta", data: extraBold, weight: 800 as const, style: "normal" as const },
    { name: "Bodoni", data: wordmark, weight: 500 as const, style: "italic" as const },
  ];
}

function CheckMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12.5l4 4 8-9" />
    </svg>
  );
}

function ShareCard({ format }: { format: Format }) {
  const story = format === "story";
  // Le carré reprend la story à une échelle plus serrée.
  const k = story ? 2 : 1.45;
  const copy = QUIZ.copy;
  const arcW = 420 * k;
  const arcH = 250 * k;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
        background: ACCENT,
        color: "#FFFFFF",
        fontFamily: "Jakarta",
        padding: story ? "104px 96px 112px" : "64px 72px 64px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -170 * k,
          right: -170 * k,
          width: 440 * k,
          height: 440 * k,
          borderRadius: 9999,
          background: "rgba(255, 255, 255, 0.09)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -120 * k,
          left: -140 * k,
          width: 360 * k,
          height: 360 * k,
          borderRadius: 9999,
          border: `${2 * k}px solid rgba(255, 255, 255, 0.16)`,
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "Bodoni", fontStyle: "italic", fontWeight: 500, fontSize: 48 * k, lineHeight: 1 }}>sapios</span>
        <span
          style={{
            display: "flex",
            background: "rgba(255, 255, 255, 0.16)",
            borderRadius: 9999,
            padding: `${11 * k}px ${20 * k}px`,
            fontSize: 18 * k,
            fontWeight: 700,
          }}
        >
          {copy.share.badge}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ position: "relative", display: "flex", width: arcW, height: arcH }}>
          <svg width={arcW} height={arcH} viewBox="0 0 420 250" style={{ position: "absolute", top: 0, left: 0 }}>
            <path d="M30 230 A180 180 0 0 1 390 230" fill="none" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="22" strokeLinecap="round" />
            <path d="M30 230 A180 180 0 0 1 390 230" fill="none" stroke="#FFFFFF" strokeWidth="22" strokeLinecap="round" />
            <circle cx="390" cy="230" r="9" fill={GOLD} />
          </svg>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 4 * k,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 22 * k, fontWeight: 700, opacity: 0.88 }}>{copy.result.label}</span>
            <span style={{ fontSize: 132 * k, fontWeight: 800, lineHeight: 0.9, letterSpacing: -0.04 * 132 * k }}>
              {String(QUIZ.score)}
            </span>
          </div>
        </div>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8 * k,
            marginTop: 22 * k,
            background: GOLD,
            color: INK,
            borderRadius: 9999,
            padding: `${12 * k}px ${22 * k}px`,
            fontSize: 20 * k,
            fontWeight: 800,
          }}
        >
          <CheckMark size={20 * k} />
          {copy.result.badge}
        </span>
        <span
          style={{
            marginTop: (story ? 40 : 18) * k,
            fontSize: 52 * k,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -0.03 * 52 * k,
          }}
        >
          {copy.result.title}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 * k }}>
        {SITE_HOST ? (
          <span
            style={{
              display: "flex",
              background: "#FFFFFF",
              color: ACCENT,
              borderRadius: 9999,
              padding: `${14 * k}px ${26 * k}px`,
              fontSize: 22 * k,
              fontWeight: 800,
            }}
          >
            {SITE_HOST}
          </span>
        ) : null}
        <span style={{ fontSize: 17 * k, fontWeight: 500, opacity: 0.85 }}>{copy.share.footer}</span>
      </div>
    </div>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  if (!(format in FORMATS)) return new Response("Format inconnu", { status: 404 });
  const size = FORMATS[format as Format];
  return new ImageResponse(<ShareCard format={format as Format} />, { ...size, fonts: await loadFonts() });
}
