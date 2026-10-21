"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SignOutButton from "./SignOutButton";

type Counts = { diplomas: number | null; reports: number | null; waitlist: number | null };

const NAV: Array<{ href: string; label: string; count?: keyof Counts }> = [
  { href: "/admin", label: "Vue d’ensemble" },
  { href: "/admin/diplomes", label: "Diplômes", count: "diplomas" },
  { href: "/admin/signalements", label: "Signalements", count: "reports" },
  { href: "/admin/liste-attente", label: "Liste d’attente", count: "waitlist" },
  { href: "/admin/paliers", label: "Paliers" },
  { href: "/admin/textes", label: "Textes" },
];

export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({ diplomas: null, reports: null, waitlist: null });

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const head = { count: "exact" as const, head: true };
    Promise.all([
      supabase.from("degree_submissions").select("id", head).eq("status", "needs_review"),
      supabase.from("reports").select("id", head).eq("status", "open"),
      supabase.from("user_access").select("user_id", head).eq("tier", "waitlist"),
    ]).then(([d, r, w]) => {
      if (!alive) return;
      setCounts({ diplomas: d.error ? null : d.count, reports: r.error ? null : r.count, waitlist: w.error ? null : w.count });
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
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
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
      <main id="adm-main" className="adm-main">
        {children}
      </main>
    </>
  );
}
