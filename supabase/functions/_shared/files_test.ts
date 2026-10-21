import { assertEquals } from "@std/assert";
import { base64Length, checkDiplomaPath, sha256Hex, sniffMime, toBase64 } from "./files.ts";

const UID = "11111111-1111-4111-8111-111111111111";
const FILE = "44444444-4444-4444-8444-444444444444";

Deno.test("chemin : {uid}/{uuid}.{ext} dans son propre dossier", () => {
  assertEquals(checkDiplomaPath(`${UID}/${FILE}.pdf`, "application/pdf", UID), {
    ok: true,
    path: `${UID}/${FILE}.pdf`,
    mime: "application/pdf",
  });
  assertEquals(checkDiplomaPath(`diplomas/${UID}/${FILE}.JPG`, "image/jpeg", UID), {
    ok: true,
    path: `${UID}/${FILE}.JPG`,
    mime: "image/jpeg",
  });
  const other = "22222222-2222-4222-8222-222222222222";
  for (
    const bad of [`${other}/${FILE}.pdf`, `${UID}/../${FILE}.pdf`, `${UID}/sub/${FILE}.pdf`, `${UID}/diplome.pdf`, `${UID}/${FILE}`, `/${UID}/${FILE}.pdf`, 42]
  ) {
    assertEquals(checkDiplomaPath(bad, "application/pdf", UID), { ok: false, error: "invalid_path" }, String(bad));
  }
});

Deno.test("type : PDF, JPEG, PNG, WEBP ; HEIC et incohérences refusés", () => {
  assertEquals(checkDiplomaPath(`${UID}/${FILE}.webp`, "image/webp", UID).ok, true);
  assertEquals(checkDiplomaPath(`${UID}/${FILE}.heic`, "image/heic", UID), { ok: false, error: "invalid_type" });
  assertEquals(checkDiplomaPath(`${UID}/${FILE}.jpg`, "image/heic", UID), { ok: false, error: "invalid_type" });
  assertEquals(checkDiplomaPath(`${UID}/${FILE}.png`, "application/pdf", UID), { ok: false, error: "invalid_type" });
  assertEquals(checkDiplomaPath(`${UID}/${FILE}.exe`, "application/pdf", UID), { ok: false, error: "invalid_type" });
});

Deno.test("type réel d'après les octets", () => {
  const enc = new TextEncoder();
  assertEquals(sniffMime(enc.encode("%PDF-1.7\n...")), "application/pdf");
  assertEquals(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assertEquals(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assertEquals(sniffMime(enc.encode("RIFF\x10\x00\x00\x00WEBPVP8 ")), "image/webp");
  assertEquals(sniffMime(enc.encode("\x00\x00\x00\x18ftypheic\x00\x00\x00\x00")), "image/heic");
  assertEquals(sniffMime(enc.encode("MZ\x90\x00")), null);
});

Deno.test("SHA-256 et base64", async () => {
  assertEquals(
    await sha256Hex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  const b64 = toBase64(bytes);
  assertEquals(b64.length, base64Length(bytes.length));
  assertEquals(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), bytes);
});
