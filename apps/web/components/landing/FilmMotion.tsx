"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

// Repères de la timeline défilée, en « secondes de film » (le spot dure 10 s).
const B = 0.15; // vérification
const S = B + 1.0; // scan
const STAMP = S + 1.45; // tampon REFUSÉ (déclenché, pas défilé)
const BC = STAMP + 1.2; // passage au noir
const C = BC + 0.55; // grille d'admission
const D1 = C + 2.0; // règle n°1
const D2 = D1 + 1.1; // « Pas d'amour. »
const E = D2 + 1.35; // carte finale
const END = E + 1.7;
const VH_PER_SECOND = 0.72;
const LABELS: Array<[number, string]> = [
  [0, "01 / Intro"],
  [B + 0.3, "02 / Vérification"],
  [C, "03 / Admission"],
  [D1 + 0.1, "04 / Règle n°1"],
  [E + 0.2, "05 / Sapios"],
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function FilmMotion() {
  useEffect(() => {
    let disposed = false;
    let revert = () => {};

    (async () => {
      const { default: Splitting } = await import("splitting");
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);
      Splitting({ target: document.querySelectorAll<HTMLElement>(".landing [data-split]"), by: "chars" });

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => buildFilm());
      revert = () => mm.revert();
    })();

    return () => {
      disposed = true;
      revert();
    };
  }, []);

  return null;
}

function buildFilm() {
  const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const qa = <T extends Element = HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));
  const film = q(".landing .film");
  const pct = q(".landing .pct");
  if (!film || !pct) return;

  // Défilement doux (molette) ; le tactile reste natif.
  const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  const raf = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);

  gsap.defaults({ ease: "expo.out", duration: 0.8 });

  // 01 — intro, jouée au chargement
  gsap.set([".landing .sA .a-wrap", ".landing .hud"], { visibility: "visible" });
  gsap
    .timeline()
    .fromTo(".landing .hud", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: "none" }, 0)
    .fromTo(".sA .a-wrap", { scale: 1.05 }, { scale: 1, duration: 2.1, ease: "power3.out" }, 0)
    .fromTo(".a-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "expo.inOut" }, 0.05)
    .from(".a-label .mask > *", { yPercent: 110, duration: 0.7 }, 0.3)
    .from(".sA .logo .char", { yPercent: 118, duration: 1.05, stagger: 0.045 }, 0.32)
    .from(".a-tag .mask > *", { yPercent: 112, stagger: 0.09 }, 0.82)
    .fromTo(".a-tag .ul", { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "expo.inOut" }, 1.2)
    .from(".a-hint", { autoAlpha: 0, y: 12, duration: 0.6 }, 1.5);

  // Tampon : impact réel (temps), rejoué si l'on remonte puis redescend.
  gsap.set(".stamp", { xPercent: -50, yPercent: -50, rotation: -9, x: 0, y: 0 });
  const impact = gsap
    .timeline({ paused: true })
    .fromTo(
      ".stamp",
      { autoAlpha: 0, scale: 2.8 },
      { autoAlpha: 1, scale: 1, duration: 0.16, ease: "power4.in", immediateRender: true },
      0,
    )
    .set(".sB .shake", { filter: "invert(1)" }, 0.16)
    .set(".sB .shake", { filter: "none" }, 0.21)
    .to(
      ".sB .shake",
      {
        keyframes: [
          { x: -18, y: 10, duration: 0.035 },
          { x: 15, y: -9, duration: 0.035 },
          { x: -10, y: 6, duration: 0.04 },
          { x: 7, y: -4, duration: 0.045 },
          { x: -3, y: 2, duration: 0.05 },
          { x: 0, y: 0, duration: 0.06 },
        ],
        ease: "none",
      },
      0.16,
    )
    .fromTo(
      ".verdict",
      { clipPath: "inset(0% 100% 0% 0%)" },
      { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, ease: "expo.inOut", immediateRender: true },
      0.25,
    )
    .from(".v-in .mask > *", { yPercent: 112, duration: 0.7, stagger: 0.07 }, 0.43);

  // Timeline défilée : le spot, transposé sur le scroll.
  const P = { p: 0 };
  const tc = q(".hud-tc");
  const sc = q(".hud-br");
  const pg = q(".hud-prog");
  let stamped = false;
  let label = "";

  const master = gsap.timeline({
    scrollTrigger: {
      trigger: film,
      start: "top top",
      end: () => `+=${Math.round(END * VH_PER_SECOND * window.innerHeight)}`,
      pin: true,
      scrub: 0.7,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
    onUpdate() {
      const t = master.time();
      if (!stamped && t >= STAMP) {
        stamped = true;
        impact.restart();
      } else if (stamped && t < STAMP - 0.02) {
        stamped = false;
        impact.pause(0);
      }
      const progress = master.progress();
      const f = Math.round(progress * 10 * 60);
      if (tc) tc.textContent = `00:00:${pad(Math.floor(f / 60))}:${pad(f % 60)}`;
      if (pg) pg.style.transform = `scaleX(${progress})`;
      const next = LABELS.filter(([at]) => t >= at).pop()?.[1] ?? LABELS[0]![1];
      if (sc && next !== label) {
        label = next;
        sc.textContent = next;
      }
    },
  });

  // 02 — vérification du diplôme
  master
    .fromTo(".sB", { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "expo.inOut" }, B)
    .to(".sA .a-wrap", { yPercent: -8, duration: 0.8, ease: "expo.inOut" }, B)
    .from(".b-step > span", { yPercent: 120, opacity: 0, duration: 0.6, stagger: 0.06 }, B + 0.35)
    .from(".b-title .mask > *", { yPercent: 112, duration: 0.85, stagger: 0.08 }, B + 0.3)
    .from(".card", { y: () => window.innerHeight * 0.9, rotation: 8, duration: 0.9 }, B + 0.35)
    .from(".prog", { opacity: 0, y: 24, duration: 0.6 }, B + 0.55)
    .fromTo(".scan", { yPercent: -115 }, { yPercent: 375, duration: 0.6, ease: "power2.inOut" }, S)
    .to(".scan", { yPercent: -115, duration: 0.6, ease: "power2.inOut" }, S + 0.6)
    .fromTo(
      P,
      { p: 0 },
      {
        p: 100,
        duration: 1.3,
        ease: "power1.inOut",
        onUpdate: () => {
          pct.textContent = `${String(Math.round(P.p)).padStart(3, "0")}%`;
        },
      },
      S,
    )
    .fromTo(".bar i", { scaleX: 0 }, { scaleX: 1, duration: 1.3, ease: "power1.inOut" }, S);
  qa(".log").forEach((el, i) => {
    const t = S + 0.15 + i * 0.38;
    master
      .fromTo(el, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.3, ease: "steps(24)" }, t)
      .from(el.querySelector("b"), { autoAlpha: 0, duration: 0.01 }, t + 0.34);
  });
  pct.textContent = "000%";

  master
    .fromTo(".blackout", { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "expo.inOut" }, BC)
    .to(".v-in", { autoAlpha: 0, duration: 0.15, ease: "none" }, BC);

  // 03 — grille d'admission
  master
    .set(".sC", { visibility: "visible" }, C)
    .from(".c-head > span", { yPercent: 120, opacity: 0, duration: 0.6, stagger: 0.06 }, C)
    .from(".c-title .mask > *", { yPercent: 112, stagger: 0.08 }, C);
  const rows = qa(".rw");
  rows.forEach((rw, i) => {
    const t = C + 0.15 + i * 0.12;
    master
      .fromTo(rw.querySelector(".ln"), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "expo.inOut" }, t)
      .from(rw.querySelectorAll(".lv, .rt"), { y: 60, opacity: 0, duration: 0.6, stagger: 0.04 }, t + 0.08);
  });
  const [r3, r4] = [rows[3], rows[4]];
  if (r3 && r4) {
    master
      .fromTo(r3.querySelector(".strike"), { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "expo.inOut" }, C + 0.95)
      .fromTo(r4.querySelector(".strike"), { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "expo.inOut" }, C + 1.03)
      .fromTo(r4.querySelector(".fill"), { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "expo.inOut" }, C + 1.12)
      .fromTo(r4, { color: "#f4f3ef" }, { color: "#0b0b0b", duration: 0.15, ease: "none" }, C + 1.22);
  }

  // 04 — règle n°1
  master
    .fromTo(".sD1", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.45, ease: "expo.inOut" }, D1)
    .from(".sD1 .mask > *", { yPercent: 112, duration: 0.6, stagger: 0.06 }, D1 + 0.1)
    .set(".sD2", { visibility: "visible" }, D2)
    .fromTo(".d2-wrap", { scale: 1.08 }, { scale: 1, duration: 0.9, ease: "power3.out" }, D2)
    .from(".sD2 .d-label .mask > *, .d2-pas", { yPercent: 112, duration: 0.6 }, D2)
    .from(".d2-txt .char", { yPercent: 112, duration: 0.7, stagger: 0.035 }, D2 + 0.05);

  // 05 — carte finale
  master
    .to(".d2-wrap", { yPercent: -10, autoAlpha: 0, duration: 0.35, ease: "power3.in" }, E)
    .set(".sE", { visibility: "visible" }, E + 0.2)
    .from(".sE .logo .char", { yPercent: 118, duration: 0.9, stagger: 0.035 }, E + 0.2)
    .fromTo(".e-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "expo.inOut" }, E + 0.38)
    .from(".e-l1 .mask > *", { yPercent: 112, duration: 0.7 }, E + 0.43)
    .from(".e-l2 .mask > *", { yPercent: 112, duration: 0.75 }, E + 0.53)
    .from(".e-cta .mask > *", { yPercent: 112, duration: 0.6, stagger: 0.06 }, E + 0.73)
    .from(".e-form", { autoAlpha: 0, y: 20, duration: 0.6 }, E + 0.85)
    .from(".e-fine", { opacity: 0, duration: 0.4, ease: "none" }, E + 0.95)
    .set({}, {}, END);

  // L'incrustation s'efface au-dessus du pied de page.
  ScrollTrigger.create({
    trigger: ".site-footer",
    start: "top bottom",
    onToggle: (self) =>
      gsap.to(".hud-dyn", { autoAlpha: self.isActive ? 0 : 1, duration: 0.3, overwrite: true }),
  });

  // Les liens « liste d'attente » amènent à la fin du film puis donnent le focus au champ.
  const goToList = (event: Event) => {
    event.preventDefault();
    const st = master.scrollTrigger;
    if (!st) return;
    lenis.scrollTo(st.end, {
      duration: 1.8,
      onComplete: () => {
        window.setTimeout(() => {
          q<HTMLInputElement>("[data-waitlist-email]")?.focus({ preventScroll: true });
        }, 900);
      },
    });
  };
  const links = qa<HTMLAnchorElement>('.landing a[href="#liste"]');
  links.forEach((a) => a.addEventListener("click", goToList));

  const onFonts = () => ScrollTrigger.refresh();
  void document.fonts?.ready.then(onFonts);

  return () => {
    links.forEach((a) => a.removeEventListener("click", goToList));
    gsap.ticker.remove(raf);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
    pct.textContent = "100%";
  };
}
