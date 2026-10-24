import { redirect } from "next/navigation";
import { loadRecruiterContext, STEP_PATH } from "@/lib/emploi/server";

// Aiguillage : connexion, bienvenue (type de compte et conditions), inscription de l'entreprise, ou espace.
export default async function RecruiterIndex() {
  const { step } = await loadRecruiterContext();
  redirect(STEP_PATH[step]);
}
