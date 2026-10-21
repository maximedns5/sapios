"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function WaitlistForm() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    // Pot de miel : un robot remplit tout, on fait semblant d'accepter.
    if (String(form.get("website") ?? "") !== "") {
      setState({ kind: "done" });
      return;
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      setState({ kind: "error", message: "Cette adresse ne passerait pas l’examen. Vérifiez-la." });
      inputRef.current?.focus();
      return;
    }

    setState({ kind: "sending" });
    try {
      const supabase = createClient();
      // Insertion seule, sans select de retour : anon ne lit rien. Un doublon (23505) vaut succès.
      const { error } = await supabase.from("waitlist_signups").insert({ email, source: "landing" });
      if (error && error.code !== "23505") throw error;
      setState({ kind: "done" });
    } catch {
      setState({
        kind: "error",
        message: "L’inscription a échoué. Ce n’est pas vous, c’est nous. Réessayez dans un instant.",
      });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="wl-done" role="status" tabIndex={-1} ref={(el) => el?.focus()}>
        <p className="label">Candidature enregistrée</p>
        <p className="serif">
          On vous rappellera. <em>Peut-être.</em>
        </p>
        <p className="wl-note">Un seul email, au lancement. Rien d’autre.</p>
      </div>
    );
  }

  const invalid = state.kind === "error";
  return (
    <form className="wl" onSubmit={onSubmit} noValidate aria-describedby={`${id}-note`}>
      <label className="lmono" htmlFor={`${id}-email`}>
        Votre email
      </label>
      <div className="wl-row">
        <input
          ref={inputRef}
          id={`${id}-email`}
          className="input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="prenom@ens.fr"
          required
          maxLength={254}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-msg` : undefined}
          data-waitlist-email=""
        />
        <button className="btn" type="submit" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "Examen…" : "Postuler"}
        </button>
      </div>
      <div className="wl-hp" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Ne pas remplir</label>
        <input id={`${id}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div aria-live="assertive">
        {state.kind === "error" ? (
          <p className="notice" id={`${id}-msg`}>
            <span className="label">Refusé</span>
            <span>{state.message}</span>
          </p>
        ) : null}
      </div>
      <p className="wl-note" id={`${id}-note`}>
        Liste d’attente : un email au lancement, désinscription sur simple demande.{" "}
        <Link href="/confidentialite">Confidentialité</Link>.
      </p>
    </form>
  );
}
