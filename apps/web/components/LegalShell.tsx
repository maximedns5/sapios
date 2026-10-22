import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import "@/app/site.css";

export default function LegalShell({
  label,
  title,
  intro,
  children,
}: {
  label: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="site" style={{ display: "flex", flexDirection: "column" }}>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <SiteHeader />
      <main id="contenu" className="legal-main">
        <p className="s-kicker">{label}</p>
        <h1 className="legal-title">{title}</h1>
        {intro ? <div className="legal-intro">{intro}</div> : null}
        <div className="legal-body">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
