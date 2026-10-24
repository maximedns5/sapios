import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Aperçu des liens partagés (1200 × 630), généré une fois au build.

export const dynamic = "force-static";
export const alt = "Sapios Emploi : recrutement à l’aveugle, diplôme vérifié.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#4338E0";
const INK = "#1A1918";
const MUTED = "#6B6762";

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

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#FFFFFF",
          fontFamily: "Jakarta",
          color: INK,
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: "Bodoni", fontStyle: "italic", fontSize: 52 }}>sapios</span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: ACCENT,
                background: "rgba(67, 56, 224, 0.08)",
                borderRadius: 999,
                padding: "6px 14px",
              }}
            >
              Emploi
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            <span>Recrutement à l’aveugle,</span>
            <span style={{ display: "flex" }}>
              <span>diplôme</span>
              <span style={{ color: ACCENT, marginLeft: 18 }}>vérifié.</span>
            </span>
          </div>
          <span style={{ fontSize: 26, fontWeight: 500, color: MUTED }}>
            Salaire affiché · CV sans photo · Réponse garantie
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 320,
            alignSelf: "center",
            borderRadius: 28,
            background: "#FFFFFF",
            boxShadow: "0 24px 60px rgba(26, 25, 24, 0.2)",
            overflow: "hidden",
            border: "1px solid #ECE8E3",
          }}
        >
          <div style={{ display: "flex", height: 170, background: "#E4DDD3", position: "relative" }}>
            <div style={{ position: "absolute", left: 24, top: 22, width: 110, height: 86, borderRadius: 6, background: "#F3EFE8" }} />
            <div style={{ position: "absolute", left: 160, top: 22, width: 110, height: 86, borderRadius: 6, background: "#F3EFE8" }} />
            <div style={{ position: "absolute", left: 0, bottom: 0, width: 320, height: 50, background: "#CFC5B8" }} />
            <div style={{ position: "absolute", right: 30, top: 80, width: 54, height: 54, borderRadius: 27, background: "#9DB3A0" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "20px 22px 26px" }}>
            <span style={{ fontSize: 24, fontWeight: 800 }}>Data analyst junior</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: MUTED }}>Maison Verte · Paris 11e</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: ACCENT }}>42–48 k€ brut/an</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await loadFonts() },
  );
}
