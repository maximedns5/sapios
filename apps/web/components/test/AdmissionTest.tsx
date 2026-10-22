"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { QUIZ } from "@sapios/shared";
import { ArrowLeft, ArrowRight, Check, Close, Download, Share, Timer } from "@/components/site/Icons";

// Test d'admission (gag) : tout se passe dans le navigateur, rien n'est envoyé ni enregistré.

type Step = { kind: "intro" } | { kind: "question"; index: number } | { kind: "computing" } | { kind: "result" };

const TOTAL = QUIZ.questions.length;
const DURATION_MS = QUIZ.durationSeconds * 1000;
const copy = QUIZ.copy;
const delay = (d: number) => ({ "--d": `${d}s` }) as CSSProperties;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AdmissionTest() {
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array(TOTAL).fill(null));
  const [endsAt, setEndsAt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // À chaque étape, le titre reçoit le focus : les lecteurs d'écran annoncent le nouvel écran.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [step]);

  const start = useCallback(() => {
    setAnswers(Array(TOTAL).fill(null));
    setEndsAt(Date.now() + DURATION_MS);
    setStep({ kind: "question", index: 0 });
    window.scrollTo({ top: 0 });
  }, []);

  const toIntro = useCallback(() => setStep({ kind: "intro" }), []);

  const stepKey = step.kind === "question" ? `q${step.index}` : step.kind;

  return (
    <div className="qz">
      <span className="qz-blob" aria-hidden="true" style={{ transform: `scale(${blobScale(step)})` }} />
      <div className="qz-col" key={stepKey}>
        {step.kind === "intro" ? <Intro titleRef={titleRef} onStart={start} /> : null}
        {step.kind === "question" ? (
          <Question
            index={step.index}
            answer={answers[step.index] ?? null}
            endsAt={endsAt}
            titleRef={titleRef}
            onQuit={toIntro}
            onAnswer={(choice) =>
              setAnswers((prev) => prev.map((value, i) => (i === step.index ? choice : value)))
            }
            onNext={() =>
              setStep(step.index + 1 < TOTAL ? { kind: "question", index: step.index + 1 } : { kind: "computing" })
            }
          />
        ) : null}
        {step.kind === "computing" ? (
          <Computing titleRef={titleRef} onDone={() => setStep({ kind: "result" })} />
        ) : null}
        {step.kind === "result" ? <Result titleRef={titleRef} onRetry={start} /> : null}
      </div>
    </div>
  );
}

function blobScale(step: Step): number {
  if (step.kind === "intro") return 1;
  if (step.kind === "question") return 1 + ((step.index + 1) / TOTAL) * 0.35;
  return 1.5;
}

type TitleRef = React.RefObject<HTMLHeadingElement | null>;

/* Introduction ------------------------------------------------------------------------------ */

function Intro({ titleRef, onStart }: { titleRef: TitleRef; onStart: () => void }) {
  const intro = copy.intro;
  return (
    <>
      <div className="qz-top">
        <Link className="s-icon-btn" href="/" aria-label="Revenir à l’accueil">
          <ArrowLeft size={22} />
        </Link>
        <span className="qz-badge">{intro.badge}</span>
      </div>

      <div className="qz-intro">
        <span className="qz-medal s-pop" aria-hidden="true">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="13.5" r="7.5" />
            <path d="M10 2.5h4M12 2.5v3.5M18.5 6.5l1.4-1.4" />
            <g className="hand">
              <path d="M12 13.5V9" />
            </g>
          </svg>
        </span>
        <span className="s-kicker s-rise" style={delay(0.15)}>
          {intro.kicker}
        </span>
        <div className="s-mask">
          <h1 className="s-h1 qz-title" ref={titleRef} tabIndex={-1} style={delay(0.2)}>
            {intro.title}
          </h1>
        </div>
        <p className="s-lead s-rise" style={delay(0.35)}>
          {intro.lead}
        </p>
      </div>

      <ul className="qz-facts">
        {intro.facts.map((fact, i) => (
          <li key={fact.label} className={`s-rise${"highlight" in fact && fact.highlight ? " is-hl" : ""}`} style={delay(0.45 + i * 0.07)}>
            <strong>{fact.value}</strong>
            <span>{fact.label}</span>
          </li>
        ))}
      </ul>

      <p className="s-small s-rise" style={delay(0.75)}>
        {intro.disclaimer}
      </p>

      <div className="qz-bottom">
        <button type="button" className="s-btn s-btn--block s-rise" style={delay(0.85)} onClick={onStart}>
          {intro.start}
          <ArrowRight />
        </button>
      </div>
    </>
  );
}

/* Question ---------------------------------------------------------------------------------- */

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function Question({
  index,
  answer,
  endsAt,
  titleRef,
  onQuit,
  onAnswer,
  onNext,
}: {
  index: number;
  answer: number | null;
  endsAt: number;
  titleRef: TitleRef;
  onQuit: () => void;
  onAnswer: (choice: number) => void;
  onNext: () => void;
}) {
  const question = QUIZ.questions[index]!;
  const now = useNow(true);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const low = left <= 30;
  const last = index === TOTAL - 1;
  const titleId = `qz-q-${question.id}`;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (answer !== null) onNext();
  }

  return (
    <form className="qz-form" onSubmit={onSubmit} style={{ display: "contents" }}>
      <div className="qz-progress">
        <div className="qz-top">
          <button type="button" className="s-icon-btn" onClick={onQuit} aria-label={copy.question.quit}>
            <Close />
          </button>
          <div className="qz-dots" aria-hidden="true">
            {QUIZ.questions.map((q, i) => (
              <i key={q.id} className={i < index ? "is-done" : i === index ? "is-now" : undefined} />
            ))}
          </div>
          <span
            className={`qz-timer${low ? " is-low" : ""}`}
            role="timer"
            aria-label={`Temps restant : ${Math.floor(left / 60)} min ${left % 60} s`}
          >
            <Timer size={16} />
            {formatTime(left)}
          </span>
        </div>
        <div className={`qz-bar${low ? " is-low" : ""}`} aria-hidden="true">
          <i style={{ width: `${(left / QUIZ.durationSeconds) * 100}%` }} />
        </div>
      </div>

      <div className="qz-question">
        <span className="s-kicker s-rise">{copy.question.counter(index + 1, TOTAL)}</span>
        <div className="s-mask">
          <h1 id={titleId} className="qz-title" ref={titleRef} tabIndex={-1} style={delay(0.08)}>
            {question.prompt}
            {question.highlight ? (
              <>
                {" "}
                <em>{question.highlight}</em>
              </>
            ) : null}
          </h1>
        </div>
      </div>

      <div className="qz-options" role="radiogroup" aria-labelledby={titleId}>
        {question.options.map((option, i) => (
          <label key={option} className={`qz-option${answer === i ? " is-on" : ""}`} style={delay(0.25 + i * 0.07)}>
            <input
              type="radio"
              name={`qz-${question.id}`}
              value={i}
              checked={answer === i}
              onChange={() => onAnswer(i)}
            />
            <span className="qz-key" aria-hidden="true">
              {"ABCD"[i]}
            </span>
            <span>{option}</span>
          </label>
        ))}
      </div>

      <div role="status" className="qz-noted">
        {answer !== null ? (
          <span className="s-rise" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Check size={18} />
            {copy.question.noted}
          </span>
        ) : left === 0 ? (
          copy.question.timeUp
        ) : null}
      </div>

      <div className="qz-bottom">
        <button type="submit" className={`s-btn s-btn--block${answer !== null ? " s-pop" : ""}`} disabled={answer === null}>
          {last ? copy.question.last : copy.question.next}
          <ArrowRight />
        </button>
      </div>
    </form>
  );
}

/* Correction -------------------------------------------------------------------------------- */

function Computing({ titleRef, onDone }: { titleRef: TitleRef; onDone: () => void }) {
  const steps = copy.computing.steps;
  const [done, setDone] = useState(0);

  useEffect(() => {
    const pace = prefersReducedMotion() ? 120 : 650;
    if (done < steps.length) {
      const id = window.setTimeout(() => setDone((n) => n + 1), done === 0 ? pace + 250 : pace);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(onDone, prefersReducedMotion() ? 100 : 450);
    return () => window.clearTimeout(id);
  }, [done, steps.length, onDone]);

  return (
    <div className="qz-computing">
      <span className="qz-scan" aria-hidden="true">
        <span className="qz-scan-in">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M2 9l10-5 10 5-10 5z" />
            <path d="M6 11v5c3 2 9 2 12 0v-5" />
          </svg>
          <i />
        </span>
      </span>
      <h1 className="s-h2 qz-title" ref={titleRef} tabIndex={-1}>
        {copy.computing.title}
      </h1>
      <ol className="qz-checks" aria-live="polite">
        {steps.map((label, i) => (
          <li key={label} className={i < done ? "is-done" : i === done ? "is-now" : undefined}>
            <span className="tick" aria-hidden="true">
              {i < done ? <Check size={14} /> : null}
            </span>
            <span>
              {label}
              {i < done ? <span className="sr-only"> : fait</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* Résultat ---------------------------------------------------------------------------------- */

function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      const id = window.setTimeout(() => setValue(target), 0);
      return () => window.clearTimeout(id);
    }
    let raf = 0;
    const startAt = performance.now() + 300;
    const duration = 1400;
    const tick = (now: number) => {
      const t = Math.min(Math.max((now - startAt) / duration, 0), 1);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

type ShareState = "idle" | "busy" | "fallback";

function Result({ titleRef, onRetry }: { titleRef: TitleRef; onRetry: () => void }) {
  const result = copy.result;
  const n = useCountUp(QUIZ.score);
  const [share, setShare] = useState<ShareState>("idle");

  async function onShare() {
    const pageUrl = `${window.location.origin}/test`;
    if (typeof navigator.share !== "function") {
      setShare("fallback");
      return;
    }
    setShare("busy");
    try {
      let files: File[] | undefined;
      try {
        const res = await fetch("/test/partage/story");
        if (res.ok) {
          const file = new File([await res.blob()], "sapios-test-admission.png", { type: "image/png" });
          if (navigator.canShare?.({ files: [file] })) files = [file];
        }
      } catch {
        // Pas d'image : on partage le lien seul.
      }
      await navigator.share({
        title: copy.share.title,
        text: `${copy.share.text} ${pageUrl}`,
        ...(files ? { files } : { url: pageUrl }),
      });
      setShare("idle");
    } catch (error) {
      // Annulé par la personne : rien à faire. Sinon, on propose le téléchargement.
      setShare(error instanceof DOMException && error.name === "AbortError" ? "idle" : "fallback");
    }
  }

  return (
    <>
      <div className="qz-top">
        <span className="s-small" style={{ fontWeight: 700 }}>
          Test d’admission · résultat
        </span>
        <Link className="s-icon-btn" href="/" aria-label="Revenir à l’accueil">
          <Close />
        </Link>
      </div>

      <div className="qz-result">
        <div className="qz-gauge">
          <svg aria-hidden="true" width="300" height="176" viewBox="0 0 300 176">
            <path d="M30 160 A120 120 0 0 1 270 160" fill="none" stroke="#ECE8E3" strokeWidth="16" strokeLinecap="round" />
            <path
              className="arc"
              d="M30 160 A120 120 0 0 1 270 160"
              pathLength={100}
              fill="none"
              strokeWidth="16"
              strokeLinecap="round"
              style={{ stroke: "var(--accent)" }}
            />
          </svg>
          <div className="qz-gauge-num">
            <span>{result.label}</span>
            <strong aria-hidden="true">{n}</strong>
            <span className="sr-only">{QUIZ.score}</span>
          </div>
        </div>

        <span className="s-pill s-pop" style={delay(1.7)}>
          <Check size={16} />
          {result.badge}
        </span>

        <div className="s-mask">
          <h1 className="qz-title" ref={titleRef} tabIndex={-1} style={delay(1.85)}>
            {result.title}
          </h1>
        </div>
        <p className="qz-sub s-rise" style={delay(2)}>
          {result.subtitle}
        </p>
        <p className="s-small s-rise" style={delay(2.1)}>
          {result.disclaimer}
        </p>
      </div>

      <div className="qz-bottom s-rise" style={delay(2.2)}>
        <button type="button" className="s-btn s-btn--block" onClick={onShare} disabled={share === "busy"}>
          <Share />
          {result.share}
        </button>
        {share === "fallback" ? (
          <div className="qz-share" role="region" aria-label="Télécharger l’image">
            <p>Le partage direct n’est pas disponible ici. Téléchargez l’image :</p>
            <div>
              <a className="s-btn s-btn--sm" href="/test/partage/story" download="sapios-test-admission-story.png">
                <Download size={18} />
                Format story
              </a>
              <a className="s-btn s-btn--sm" href="/test/partage/carre" download="sapios-test-admission-carre.png">
                <Download size={18} />
                Format carré
              </a>
            </div>
          </div>
        ) : null}
        <Link className="s-btn s-btn--soft s-btn--block" href="/?via=test#postuler">
          {result.apply}
        </Link>
        <button type="button" className="qz-retry" onClick={onRetry}>
          {result.retry}. {result.retryHint}
        </button>
      </div>
    </>
  );
}
