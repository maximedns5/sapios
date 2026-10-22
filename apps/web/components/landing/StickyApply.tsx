"use client";

import { useEffect, useState } from "react";

/**
 * Bouton « Postuler » fixé en bas sur téléphone : il apparaît une fois l'appel à l'action du héros
 * dépassé et s'efface quand le formulaire est à l'écran (audit n°02).
 */
export default function StickyApply({ heroId, formId }: { heroId: string; formId: string }) {
  const [heroGone, setHeroGone] = useState(false);
  const [formShown, setFormShown] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(heroId);
    const form = document.getElementById(formId);
    if (!hero || !form || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) setHeroGone(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        if (entry.target === form) setFormShown(entry.isIntersecting);
      }
    });
    io.observe(hero);
    io.observe(form);
    return () => io.disconnect();
  }, [heroId, formId]);

  const visible = heroGone && !formShown;
  return (
    <div className="lp-sticky" data-visible={visible} aria-hidden={!visible}>
      <a className="s-btn" href={`#${formId}`} tabIndex={visible ? undefined : -1}>
        Postuler
      </a>
    </div>
  );
}
