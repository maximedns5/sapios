import { MyProfile } from '@/components/MyProfile';

/** « Mon profil » hors des onglets : pendant la relecture du diplôme, de quoi montrer le reste. */
export default function MyProfileStack() {
  return <MyProfile mode="stack" />;
}
