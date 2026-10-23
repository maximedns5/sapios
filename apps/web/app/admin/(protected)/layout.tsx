import { redirect } from "next/navigation";
import AccessDenied from "@/components/admin/AccessDenied";
import AdminShell from "@/components/admin/AdminShell";
import { isAdminAccount } from "@/lib/admin/mfa";
import { createClient } from "@/lib/supabase/server";

// Garde serveur : session valide, double authentification (aal2), puis `is_admin()`.
// La RLS et les RPC admin restent le vrai verrou : `is_admin()` exige lui aussi une session aal2.
export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/connexion");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    const account = await isAdminAccount(supabase);
    if (account === null) return <AccessDenied email={user.email ?? null} reason="unavailable" />;
    if (account) redirect("/admin/double-authentification");
    return <AccessDenied email={user.email ?? null} reason="forbidden" />;
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) return <AccessDenied email={user.email ?? null} reason="unavailable" />;
  if (isAdmin !== true) return <AccessDenied email={user.email ?? null} reason="forbidden" />;

  return <AdminShell email={user.email ?? ""}>{children}</AdminShell>;
}
