import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AccessDenied from "@/components/admin/AccessDenied";
import MfaGate from "@/components/admin/MfaGate";
import { isAdminAccount, verifiedFactors } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Double authentification" };

// Hors du groupe protégé : on y arrive en aal1. Réservé aux comptes admins ; les autres reçoivent 403.
export default async function MfaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/connexion");

  const account = await isAdminAccount(supabase);
  if (account === null) return <AccessDenied email={user.email ?? null} reason="unavailable" />;
  if (!account) return <AccessDenied email={user.email ?? null} reason="forbidden" />;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/admin");

  let hasFactor = false;
  try {
    hasFactor = (await verifiedFactors(supabase)).length > 0;
  } catch {
    return <AccessDenied email={user.email ?? null} reason="unavailable" />;
  }
  return <MfaGate email={user.email ?? ""} mode={hasFactor ? "challenge" : "enroll"} />;
}
