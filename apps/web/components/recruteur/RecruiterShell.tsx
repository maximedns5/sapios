"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CompanyStatus } from "@sapios/shared";
import { IconAlert, IconBuilding, IconCard, IconChat, IconClock, IconOffers, IconSearch, IconTeam } from "./Icons";
import SignOutButton from "./SignOutButton";

const NAV = [
  { href: "/recruteur/offres", label: "Offres", icon: IconOffers },
  { href: "/recruteur/approche", label: "Approche directe", icon: IconSearch },
  { href: "/recruteur/messages", label: "Messages", icon: IconChat, count: true },
] as const;

const NAV_COMPANY = [
  { href: "/recruteur/entreprise", label: "Entreprise", icon: IconBuilding },
  { href: "/recruteur/entreprise#equipe", label: "Équipe", icon: IconTeam },
] as const;

function initials(name: string | null, fallback: string): string {
  const src = (name || fallback || "?").trim();
  return src.slice(0, 1).toUpperCase();
}

export default function RecruiterShell({
  email,
  companyName,
  companyStatus,
  statusReason,
  jobTitle,
  firstName,
  unread,
  children,
}: {
  email: string;
  companyName: string;
  companyStatus: CompanyStatus;
  statusReason: string | null;
  jobTitle: string | null;
  firstName: string | null;
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/recruteur/offres"
      ? pathname.startsWith("/recruteur/offres") || pathname.startsWith("/recruteur/candidatures")
      : !href.includes("#") && pathname.startsWith(href);

  return (
    <div className="rec-shell">
      <a className="skip-link" href="#rec-main">
        Aller au contenu
      </a>
      <aside className="rec-side">
        <Link href="/recruteur/offres" className="rec-brand" style={{ textDecoration: "none" }}>
          <span className="wordmark">sapios</span>
          <span className="wordmark-tag">Emploi</span>
        </Link>
        <nav className="rec-nav" aria-label="Espace recruteur">
          {NAV.map(({ href, label, icon: Icon, ...rest }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>
              <Icon />
              {label}
              {"count" in rest && unread > 0 ? (
                <span className="rec-nav-count" aria-label={`${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`}>
                  {unread}
                </span>
              ) : null}
            </Link>
          ))}
          <hr />
          {NAV_COMPANY.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          ))}
          <span className="rec-nav-soon">
            <IconCard />
            Facturation
            <span className="rec-nav-tag">après le pilote</span>
          </span>
        </nav>
        <div className="rec-me">
          <span className="rec-avatar" aria-hidden="true">
            {initials(firstName, email)}
          </span>
          <span>
            <strong title={email}>{firstName || email}</strong>
            <small>{[jobTitle, companyName].filter(Boolean).join(" · ")}</small>
          </span>
        </div>
        <SignOutButton />
      </aside>

      <nav className="rec-topbar" aria-label="Espace recruteur">
        <Link href="/recruteur/offres" className="wordmark">
          sapios
        </Link>
        {[...NAV, NAV_COMPANY[0]].map(({ href, label }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      <main id="rec-main" className="rec-main">
        {companyStatus === "pending" ? (
          <div className="banner banner--accent" role="status">
            <IconClock />
            <span>
              {companyName} est en attente de vérification par Sapios, en général sous 24 h. Vous pouvez préparer
              vos offres : elles partiront en vérification dès la validation.
            </span>
          </div>
        ) : companyStatus === "rejected" || companyStatus === "suspended" ? (
          <div className="banner banner--err" role="alert">
            <IconAlert />
            <span>
              {companyStatus === "rejected"
                ? "L’inscription de votre entreprise a été refusée."
                : "Votre entreprise est suspendue : ses offres ne sont plus visibles."}
              {statusReason ? ` Motif : ${statusReason}` : ""} Pour en parler, répondez à l’email reçu.
            </span>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
