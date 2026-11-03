import { assertEquals, assertRejects } from "@std/assert";
import { HttpError } from "./http.ts";
import { requireMfaSession, resetRecruiterMfa } from "./mfa.ts";
import { FakeSupabase } from "./testing/fake_supabase.ts";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const RECRUITER = "00000000-0000-4000-8000-000000000010";
const COMPANY = "00000000-0000-4000-8000-0000000000aa";

function fixture(): FakeSupabase {
  const db = new FakeSupabase();
  db.tables.company_members = [{ company_id: COMPANY, user_id: RECRUITER }];
  db.tables.admins = [{ user_id: ADMIN }];
  db.tables.audit_log = [];
  db.factors[RECRUITER] = [{ id: "f1", factor_type: "totp", status: "verified" }, { id: "f2", factor_type: "totp", status: "unverified" }];
  return db;
}

Deno.test("réinitialisation : supprime tous les facteurs du recruteur et journalise", async () => {
  const db = fixture();
  const result = await resetRecruiterMfa(db.asClient(), ADMIN, RECRUITER, "Téléphone perdu, identité vérifiée par email");
  assertEquals(result, { removed: 2 });
  assertEquals(db.factors[RECRUITER], []);
  const audit = db.writes().filter((w) => w.table === "audit_log");
  assertEquals(audit.length, 1);
  assertEquals(audit[0].values?.action, "recruiter.mfa_reset");
  assertEquals(audit[0].values?.entity_id, RECRUITER);
  assertEquals((audit[0].values?.payload as Record<string, unknown>).removed, 2);
  assertEquals((audit[0].values?.payload as Record<string, unknown>).company_id, COMPANY);
});

Deno.test("réinitialisation : un compte qui n'est pas recruteur est introuvable, rien n'est touché", async () => {
  const db = fixture();
  const other = "00000000-0000-4000-8000-000000000099";
  db.factors[other] = [{ id: "x", factor_type: "totp", status: "verified" }];
  const err = await assertRejects(() => resetRecruiterMfa(db.asClient(), ADMIN, other, "raison"), HttpError);
  assertEquals([err.status, err.code], [404, "not_found"]);
  assertEquals(db.factors[other].length, 1);
  assertEquals(db.writes().length, 0);
});

Deno.test("réinitialisation : jamais pour un compte admin (même s'il est aussi membre)", async () => {
  const db = fixture();
  db.tables.company_members.push({ company_id: COMPANY, user_id: ADMIN });
  db.factors[ADMIN] = [{ id: "a1", factor_type: "totp", status: "verified" }];
  const err = await assertRejects(() => resetRecruiterMfa(db.asClient(), ADMIN, ADMIN, "raison"), HttpError);
  assertEquals([err.status, err.code], [403, "forbidden"]);
  assertEquals(db.factors[ADMIN].length, 1);
});

Deno.test("session : facteur vérifié en aal1 → mfa_required ; sinon la session passe", async () => {
  const refused = new FakeSupabase({ mfa_session_ok: () => false });
  const err = await assertRejects(() => requireMfaSession(refused.asClient()), HttpError);
  assertEquals([err.status, err.code], [403, "mfa_required"]);
  const ok = new FakeSupabase({ mfa_session_ok: () => true });
  await requireMfaSession(ok.asClient());
  assertEquals(ok.rpcCalls.map((c) => c.name), ["mfa_session_ok"]);
});
