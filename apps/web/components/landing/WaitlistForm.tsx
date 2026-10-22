"use client";

import Link from "next/link";
import { useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Alert, ArrowRight, Check } from "@/components/site/Icons";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; email: string }
  | { kind: "error"; message: string; tries: number };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

// Niveau déclaré (facultatif, jamais vérifié ici) sur l'échelle des diplômes de l'app (1 à 8).
const LEVEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Je préfère ne pas le dire" },
  { value: "8", label: "Bac+8 · doctorat" },
  { value: "7", label: "Bac+5 · master, ingénieur, grande école" },
  { value: "6", label: "Bac+3 · licence, BUT" },
  { value: "5", label: "Bac+2 · BTS, DUT" },
  { value: "4", label: "Bac" },
];
const CITY_MAX = 80;

function emailProblem(email: string): string | null {
  if (!email) return "Indiquez votre email.";
  if (!email.includes("@")) return "Il manque le « @ » de l’adresse.";
  if (!EMAIL_RE.test(email) || email.length > 254) return "Il manque la fin de l’adresse, par exemple « @ens.fr ».";
  return null;
}

/** Provenance enregistrée avec l'inscription : la landing, ou le résultat du test. */
function signupSource(): string {
  return new URLSearchParams(window.location.search).get("via") === "test" ? "test" : "landing";
}

const delay = (d: string) => ({ "--d": d }) as CSSProperties;

export default function WaitlistForm() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;
    const value = email.trim();

    // Pot de miel : un robot remplit tout, on fait semblant d'accepter.
    if (String(new FormData(event.currentTarget).get("website") ?? "") !== "") {
      setState({ kind: "done", email: value });
      return;
    }
    const problem = emailProblem(value);
    if (problem) {
      setState({ kind: "error", message: problem, tries: state.kind === "error" ? state.tries + 1 : 1 });
      inputRef.current?.focus();
      return;
    }

    setState({ kind: "sending" });
    try {
      const supabase = createClient();
      // Insertion seule, sans select de retour : anon ne lit rien. Un doublon (23505) vaut succès.
      const { error } = await supabase.from("waitlist_signups").insert({
        email: value,
        source: signupSource(),
        level: level ? Number(level) : null,
        city: city.trim().slice(0, CITY_MAX) || null,
      });
      if (error && error.code !== "23505") throw error;
      setState({ kind: "done", email: value });
    } catch {
      setState({ kind: "error", message: "L’inscription n’a pas abouti. Réessayez dans un instant.", tries: 1 });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="wl-done" role="status">
        <span className="wl-check" aria-hidden="true">
          <span>
            <Check size={44} />
          </span>
        </span>
        <div className="s-mask">
          <div style={delay("0.35s")}>
            <h2 className="s-h2" tabIndex={-1} ref={(el) => el?.focus()}>
              Vous êtes sur la liste.
            </h2>
          </div>
        </div>
        <p className="s-lead s-rise" style={delay("0.5s")}>
          {state.email ? (
            <>
              Nous écrirons à <strong>{state.email}</strong> à l’ouverture. Une seule fois.
            </>
          ) : (
            <>Nous vous écrirons à l’ouverture. Une seule fois.</>
          )}
        </p>
        <ol className="wl-next s-rise" style={delay("0.6s")} aria-label="La suite">
          <li>
            <span className="lp-num" aria-hidden="true">
              1
            </span>
            <span>À l’ouverture, vous recevez votre accès à l’application.</span>
          </li>
          <li>
            <span className="lp-num" aria-hidden="true">
              2
            </span>
            <span>Vous y déposez votre diplôme, en photo ou en PDF.</span>
          </li>
          <li>
            <span className="lp-num" aria-hidden="true">
              3
            </span>
            <span>Un humain le vérifie, sous 48 h. Ensuite, les présentations.</span>
          </li>
        </ol>
        <Link className="s-btn s-btn--soft s-rise" style={delay("0.7s")} href="/test">
          Passer le test en attendant
          <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  const error = state.kind === "error" ? state : null;
  return (
    <form className="wl" onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`} aria-describedby={`${id}-note`}>
      <div className="wl-head">
        <h2 className="s-h2" id={`${id}-title`}>
          Postulez.
        </h2>
        <p className="s-lead">Inscrivez-vous sur la liste d’attente. Les inscrits entrent en premier.</p>
      </div>
      <div className="s-field">
        <label className="s-label" htmlFor={`${id}-email`}>
          Email
        </label>
        <input
          ref={inputRef}
          id={`${id}-email`}
          className="s-input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="vous@exemple.fr"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-msg` : undefined}
          // Alterne entre deux animations identiques pour rejouer la secousse à chaque erreur.
          data-shake={error ? error.tries % 2 : undefined}
        />
        <div aria-live="assertive">
          {error ? (
            <p className="s-error" id={`${id}-msg`}>
              <Alert size={16} />
              {error.message}
            </p>
          ) : null}
        </div>
      </div>
      <div className="wl-row">
        <div className="s-field">
          <label className="s-label" htmlFor={`${id}-level`}>
            Votre diplôme <span className="s-optional">facultatif</span>
          </label>
          <select
            id={`${id}-level`}
            className="s-input s-select"
            name="level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="s-field">
          <label className="s-label" htmlFor={`${id}-city`}>
            Votre ville <span className="s-optional">facultatif</span>
          </label>
          <input
            id={`${id}-city`}
            className="s-input"
            type="text"
            name="city"
            autoComplete="address-level2"
            placeholder="Paris, Lyon…"
            maxLength={CITY_MAX}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
      </div>
      <div className="wl-hp" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Ne pas remplir</label>
        <input id={`${id}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="s-btn s-btn--block" type="submit" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Envoi…" : "Postuler"}
      </button>
      <p className="wl-note" id={`${id}-note`}>
        Un seul email, à l’ouverture. Diplôme et ville nous aident à ouvrir ville par ville ; rien n’est vérifié
        ici, votre diplôme le sera dans l’app. Vous pouvez tout faire retirer sur simple demande.{" "}
        <Link href="/confidentialite">Confidentialité</Link>.
      </p>
    </form>
  );
}
