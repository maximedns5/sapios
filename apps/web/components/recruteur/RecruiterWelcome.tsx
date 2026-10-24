"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { EmploiAccountKind } from "@sapios/shared";
import { describeEmploiError, emploiErrorMessage, errorCode } from "@/lib/emploi/errors";
import { rpc } from "@/lib/emploi/rpc";
import { createClient } from "@/lib/supabase/client";
import Gate from "./Gate";
import SignOutButton from "./SignOutButton";

const PROMISES = [
  "Des offres réelles, rédigées en français, avec une fourchette de salaire brute annuelle.",
  "Des CV anonymes jusqu’à votre « Intéressé » : ni nom, ni photo, ni âge, ni genre, ni adresse.",
  "Une réponse humaine à chaque candidature dans le délai que vous choisissez : 3, 7 ou 10 jours. Sans réponse, la candidature est close et comptée dans votre délai moyen, affiché aux candidats.",
  "Aucun critère discriminatoire, et des photos montrant des personnes seulement avec leur accord écrit.",
  "Gratuit pendant le pilote.",
];

export default function RecruiterWelcome({
  email,
  kind,
  termsVersion,
  unavailable,
  appUrl,
}: {
  email: string;
  kind: EmploiAccountKind | null;
  termsVersion: string | null;
  unavailable: string | null;
  appUrl: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function becomeRecruiter() {
    setBusy(true);
    setError(null);
    const { error } = await rpc<null>(createClient(), "set_account_kind", { p_kind: "recruiter" });
    setBusy(false);
    if (error && (await errorCode(error)) !== "kind_already_set") {
      setError(await describeEmploiError(error));
      return;
    }
    router.refresh();
  }

  async function acceptTerms() {
    if (!termsVersion) return;
    setBusy(true);
    setError(null);
    const { error } = await rpc<null>(createClient(), "accept_emploi_terms", { p_version: termsVersion });
    setBusy(false);
    if (error) {
      setError(await describeEmploiError(error));
      router.refresh();
      return;
    }
    router.refresh();
  }

  const aside = (
    <span className="row small muted">
      <span title={email}>{email}</span>
      <SignOutButton />
    </span>
  );

  if (unavailable) {
    return (
      <Gate aside={aside}>
        <h1>Service momentanément indisponible</h1>
        <p className="alert" role="alert">
          {emploiErrorMessage(unavailable)}
        </p>
        <button type="button" className="btn btn--soft" onClick={() => router.refresh()}>
          Réessayer
        </button>
      </Gate>
    );
  }

  if (kind === "candidate") {
    return (
      <Gate aside={aside}>
        <p className="rec-eyebrow">Compte candidat</p>
        <h1>Ce compte sert déjà à chercher un emploi.</h1>
        <p className="rec-lead">
          Un compte Sapios est soit candidat, soit recruteur. Pour recruter, connectez-vous avec votre adresse
          professionnelle, distincte de celle de votre compte candidat.
        </p>
        <div className="row">
          {appUrl ? (
            <a className="btn btn--accent btn--lg" href={appUrl}>
              Ouvrir l’app candidat
            </a>
          ) : null}
          <SignOutButton className="btn btn--soft btn--lg" />
        </div>
      </Gate>
    );
  }

  if (kind === null) {
    return (
      <Gate aside={aside}>
        <p className="rec-eyebrow">Bienvenue</p>
        <h1>Créez votre espace recruteur.</h1>
        <p className="rec-lead">
          Vous publiez des offres avec leur salaire et de vraies photos du lieu de travail. Les candidats, au
          diplôme vérifié, postulent avec un CV anonyme. Vous répondez dans le délai promis.
        </p>
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className="btn btn--accent btn--lg" onClick={becomeRecruiter} disabled={busy}>
          {busy ? "Création…" : "Créer mon espace recruteur"}
        </button>
        <p className="hint">
          Vous cherchez un emploi ? Ne continuez pas ici :{" "}
          {appUrl ? <a href={appUrl}>passez par l’app candidat</a> : "passez par l’app candidat"}.
        </p>
      </Gate>
    );
  }

  return (
    <Gate aside={aside}>
      <p className="rec-eyebrow">Conditions recruteurs</p>
      <h1>Cinq engagements avant de commencer.</h1>
      <ol className="rec-points">
        {PROMISES.map((p, i) => (
          <li key={p}>
            <span aria-hidden="true">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <p>
        <Link className="link" href="/conditions-recruteurs" target="_blank">
          Lire les conditions générales recruteurs
        </Link>
      </p>
      <label className="check" htmlFor={`${id}-agree`}>
        <input id={`${id}-agree`} type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          J’ai lu et j’accepte les conditions générales recruteurs{termsVersion ? ` (version ${termsVersion})` : ""}, au
          nom de mon entreprise.
        </span>
      </label>
      {!termsVersion ? (
        <p className="alert" role="alert">
          Aucune version des conditions n’est en vigueur : réessayez plus tard.
        </p>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn--accent btn--lg"
        onClick={acceptTerms}
        disabled={busy || !agree || !termsVersion}
      >
        {busy ? "Enregistrement…" : "Accepter et continuer"}
      </button>
    </Gate>
  );
}
