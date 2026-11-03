import type { Metadata } from "next";
import SecuritySettings from "@/components/recruteur/SecuritySettings";
import { ErrorBox } from "@/components/recruteur/ui";
import { MFA_MESSAGES, type TotpFactor, verifiedFactors } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sécurité" };

export default async function RecruiterSecurityPage() {
  const supabase = await createClient();
  const factors: TotpFactor[] | null = await verifiedFactors(supabase).catch(() => null);
  if (!factors) return <ErrorBox message={MFA_MESSAGES.generic} />;
  return <SecuritySettings initialFactors={factors} />;
}
