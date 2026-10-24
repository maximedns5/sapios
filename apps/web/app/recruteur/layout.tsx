import type { Metadata } from "next";
import "./recruteur.css";

export const metadata: Metadata = {
  title: { default: "Espace recruteur", template: "%s — Sapios Emploi recruteurs" },
  robots: { index: false, follow: false },
};

export default function RecruiterRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="rec">{children}</div>;
}
