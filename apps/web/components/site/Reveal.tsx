"use client";

import { useEffect } from "react";

/** Fait apparaître les éléments `.s-reveal` quand ils entrent à l'écran (une seule fois). */
export default function Reveal() {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>(".s-reveal"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
