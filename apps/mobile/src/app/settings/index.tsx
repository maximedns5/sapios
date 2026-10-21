import { AccountScreen } from '@/components/AccountScreen';

/** Compte accessible hors des onglets (verdict, revue, onboarding). */
export default function Settings() {
  return <AccountScreen standalone />;
}
