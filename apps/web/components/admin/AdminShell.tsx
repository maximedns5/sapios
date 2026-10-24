"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { untyped } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import SignOutButton from "./SignOutButton";

type Counts = { companies: number | null; offers: number | null; reports: number | null; diplomas: number | null };

const NAV: Array<{ href: string; label: string; count?: keyof Counts; group?: readonly string[] }> = [
  { href: "/admin", label: "Vue d’ensemble" },
  { href: "/admin/entreprises", label: "Entreprises", count: "companies" },
  { href: "/admin/offres", label: "Offres et photos", count: "offers" },
  { href: "/admin/signalements", label: "Signalements", count: "reports" },
  { href: "/admin/diplomes", label: "Diplômes", count: "diplomas" },
  {
    href: "/admin/textes",
    label: "Réglages",
    group: ["/admin/textes", "/admin/conformite", "/admin/securite"],
  },
];

// Les réglages tiennent sous un seul onglet ; leurs pages ont une barre secondaire.
const SETTINGS: Array<{ href: string; label: string }> = [
  { href: "/admin/textes", label: "Textes" },
  { href: "/admin/conformite", label: "Conformité" },
  { href: "/admin/securite", label: "Sécurité" },
];

export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({ companies: null, offers: null, reports: null, diplomas: null });

  useEffect(() => {
    const supabase = createClient();
    // Tables de l'emploi absentes du typage généré tant que leur migration n'est pas fusionnée.
    const db = untyped(supabase);
    let alive = true;
    const head = { count: "exact" as const, head: true };
    Promise.all([
      db.from("companies").select("id", head).eq("status", "pending"),
      db.from("offers").select("id", head).eq("status", "pending_review"),
      db.from("offer_reports").select("id", head).eq("status", "open"),
      supabase.from("degree_submissions").select("id", head).eq("status", "needs_review"),
    ]).then(([c, o, r, d]) => {
      if (!alive) return;
      setCounts({
        companies: c.error ? null : c.count,
        offers: o.error ? null : o.count,
        reports: r.error ? null : r.count,
        diplomas: d.error ? null : d.count,
      });
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#adm-main">
        Aller au contenu
      </a>
      <header className="adm-bar dark">
        <Link href="/admin" className="adm-brand">
          <b>
            SAPIOS<sup>®</sup>
          </b>
          <span className="label">Back-office</span>
        </Link>
        <nav className="adm-nav label" aria-label="Back-office">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : (item.group ?? [item.href]).some((href) => pathname.startsWith(href));
            const n = item.count ? counts[item.count] : null;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                {item.label}
                {n ? (
                  <span className="adm-count" aria-label={`${n} en attente`}>
                    {n}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="adm-user">
          <span className="label" title={email}>
            {email}
          </span>
          <SignOutButton />
        </div>
      </header>
      {SETTINGS.some((item) => pathname.startsWith(item.href)) ? (
        <nav className="adm-subnav label" aria-label="Réglages">
          {SETTINGS.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <main id="adm-main" className="adm-main">
        {children}
      </main>
    </>
  );
}
