import type { Metadata } from "next";
import { redirect } from "next/navigation";
import RecruiterLogin from "@/components/recruteur/RecruiterLogin";
import { RECRUITER_PASSWORD_LOGIN } from "@/lib/emploi/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connexion" };

export default async function RecruiterLoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/recruteur");
  const { erreur } = await searchParams;
  return <RecruiterLogin linkError={erreur === "lien"} allowPassword={RECRUITER_PASSWORD_LOGIN} />;
}
