import type { Metadata } from "next";
import { redirect } from "next/navigation";
import RecruiterMfaChallenge from "@/components/recruteur/RecruiterMfaChallenge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Double authentification" };

// Hors de l'espace : on y arrive en aal1. Sans application enregistrée, ou déjà en aal2, rien à faire ici.
export default async function RecruiterMfaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/recruteur/connexion");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.currentLevel === "aal2" || aal.nextLevel !== "aal2") redirect("/recruteur");
  return <RecruiterMfaChallenge email={user.email ?? ""} />;
}
