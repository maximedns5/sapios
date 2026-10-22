import type { Metadata, Viewport } from "next";
import AdmissionTest from "@/components/test/AdmissionTest";
import "../site.css";

export const metadata: Metadata = {
  title: "Test d’admission",
  description:
    "Le test d’admission de Sapios : dix questions, trois minutes, un résultat garanti. Non scientifique, rien n’est enregistré.",
  openGraph: {
    title: "Test d’admission Sapios",
    description: "QI estimé : 130. Comme tout le monde ici.",
    images: [{ url: "/test/partage/carre", width: 1080, height: 1080, alt: "QI estimé : 130. Comme tout le monde ici." }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

export default function TestPage() {
  return (
    <div className="site">
      <main>
        <AdmissionTest />
      </main>
    </div>
  );
}
