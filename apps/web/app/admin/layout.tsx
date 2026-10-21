import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Back-office", template: "%s — Back-office Sapios" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="admin light">{children}</div>;
}
