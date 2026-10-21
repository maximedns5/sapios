// Consommation de la file d'extraction (brief §7.3 « File d'extraction »).
// Garantie centrale : ce module ne peut que passer une soumission en `processing` puis en
// `needs_review`. Le magasin qu'il reçoit n'offre aucune écriture de `approved` ni de `user_access`.
import { computeSignals, tripletKey } from "../_shared/checks.ts";
import type { Extractor } from "../_shared/extractor.ts";
import { isUuid } from "../_shared/http.ts";
import type { DiplomaMime, DiplomaSignal, Extraction, SubmissionStatus } from "../_shared/shared.ts";

export const MAX_ATTEMPTS = 3;
export const QUEUE_BATCH = 3;
/** Délai de visibilité : un message non supprimé réapparaît après 5 minutes. */
export const QUEUE_VISIBILITY_SECONDS = 300;

export interface QueueMessage {
  msg_id: number;
  read_ct: number;
  message: unknown;
}

export interface SubmissionRow {
  id: string;
  user_id: string;
  storage_path: string;
  mime: DiplomaMime;
  status: SubmissionStatus;
  attempts: number;
}

export interface ReviewPayload {
  extracted: Extraction | null;
  confidence: number | null;
  signals: string[];
}

export interface ProcessStore {
  readQueue(qty: number, visibilitySeconds: number): Promise<QueueMessage[]>;
  deleteMessage(msgId: number): Promise<void>;
  loadSubmission(id: string): Promise<SubmissionRow | null>;
  /** `processing` + compteur d'essais ; faux si la soumission n'est plus en attente. */
  startAttempt(id: string, attempts: number): Promise<boolean>;
  downloadFile(storagePath: string): Promise<Uint8Array | null>;
  loadIdentity(userId: string): Promise<{ legal_name: string | null; birthdate: string | null }>;
  /** Extractions d'autres comptes ayant la même année (doublon du triplet). */
  otherExtractions(userId: string, year: number): Promise<Extraction[]>;
  /** Passe en `needs_review` : seul statut final que ce module sait écrire. */
  sendToReview(id: string, payload: ReviewPayload): Promise<void>;
}

export interface ProcessDeps {
  store: ProcessStore;
  extract: Extractor;
  now?: () => Date;
  log?: (msg: string, extra?: unknown) => void;
}

const OPEN_STATUSES: SubmissionStatus[] = ["pending", "processing"];

function submissionIdOf(message: unknown): string | null {
  if (message && typeof message === "object") {
    const m = message as Record<string, unknown>;
    const id = m.submission_id ?? m.id;
    if (isUuid(id)) return id;
  }
  return null;
}

const review = (signals: DiplomaSignal[]): ReviewPayload => ({ extracted: null, confidence: null, signals });

/** Analyse d'une soumission. Lève une exception pour un échec transitoire. */
async function analyse(deps: ProcessDeps, sub: SubmissionRow): Promise<ReviewPayload> {
  const { store } = deps;
  const bytes = await store.downloadFile(sub.storage_path);
  if (!bytes) return review(["file_missing", "extraction_impossible"]);

  const outcome = await deps.extract({ bytes, mime: sub.mime });
  switch (outcome.kind) {
    case "unavailable":
      deps.log?.("extraction indisponible", outcome.detail);
      return review(["extraction_unavailable"]);
    case "refusal":
      return review(["model_refusal"]);
    case "unparseable":
      deps.log?.("sortie du modèle inexploitable", outcome.detail);
      return review(["extraction_unparseable"]);
    case "too_large":
      return review(["file_too_large_for_extraction"]);
    case "ok": {
      const ex = outcome.extraction;
      const identity = await store.loadIdentity(sub.user_id);
      const others = ex.year_awarded == null ? [] : await store.otherExtractions(sub.user_id, ex.year_awarded);
      const otherTriplets = others
        .map((o) => tripletKey(o.holder_full_name, o.institution, o.year_awarded))
        .filter((k): k is string => k !== null);
      const signals = computeSignals({
        extraction: ex,
        legalName: identity.legal_name,
        birthdate: identity.birthdate,
        otherTriplets,
        now: deps.now?.() ?? new Date(),
      });
      return { extracted: ex, confidence: ex.confidence, signals };
    }
  }
}

/** Traite un message ; vrai s'il est terminé (supprimé de la file). */
export async function processMessage(deps: ProcessDeps, msg: QueueMessage): Promise<boolean> {
  const { store } = deps;
  const id = submissionIdOf(msg.message);
  const sub = id ? await store.loadSubmission(id) : null;
  if (!sub || !OPEN_STATUSES.includes(sub.status)) {
    await store.deleteMessage(msg.msg_id);
    return true;
  }

  // Les deux compteurs : `attempts` (base) et `read_ct` (pgmq, couvre les plantages avant écriture).
  const attempt = Math.max(sub.attempts + 1, msg.read_ct);
  if (attempt > MAX_ATTEMPTS) {
    await store.sendToReview(sub.id, review(["extraction_impossible"]));
    await store.deleteMessage(msg.msg_id);
    return true;
  }
  if (!(await store.startAttempt(sub.id, attempt))) {
    await store.deleteMessage(msg.msg_id);
    return true;
  }

  let payload: ReviewPayload;
  try {
    payload = await analyse(deps, sub);
  } catch (err) {
    deps.log?.(`essai ${attempt}/${MAX_ATTEMPTS} en échec pour ${sub.id}`, err);
    if (attempt < MAX_ATTEMPTS) return false; // le message réapparaîtra après le délai de visibilité
    payload = review(["extraction_impossible"]);
  }
  await store.sendToReview(sub.id, payload);
  await store.deleteMessage(msg.msg_id);
  return true;
}

export async function processQueue(deps: ProcessDeps, qty = QUEUE_BATCH): Promise<number> {
  const messages = await deps.store.readQueue(qty, QUEUE_VISIBILITY_SECONDS);
  const results = await Promise.allSettled(messages.map((m) => processMessage(deps, m)));
  let processed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) processed++;
    if (r.status === "rejected") deps.log?.("message non traité", r.reason);
  }
  return processed;
}
