import type { Metadata } from "next";
import OffersReview from "@/components/admin/OffersReview";

export const metadata: Metadata = { title: "Offres et photos" };

export default function OffersReviewPage() {
  return <OffersReview />;
}
