// Test d'admission (fonctionnalité 2, option A) : un gag assumé, partagé par la landing et l'app.
// Rien n'est enregistré, le score ne dépend pas des réponses et le test ne touche ni à l'accès
// ni au classement. Il ne doit jamais apparaître à côté d'un paiement.

export type QuizQuestion = {
  id: string;
  /** Énoncé. `highlight`, s'il existe, se lit à la suite, mis en valeur. */
  prompt: string;
  highlight?: string;
  options: readonly [string, string, string, string];
};

export type QuizFact = { value: string; label: string; highlight?: boolean };

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  {
    id: "proust",
    prompt: "Combien de temps faut-il pour lire « À la recherche du temps perdu » ?",
    options: ["Le temps de le perdre", "Sept tomes", "Une vie, si l’on est honnête", "J’ai vu le film"],
  },
  {
    id: "suite",
    prompt: "Complétez la suite : 2, 4, 8, 16…",
    options: ["32", "64, par optimisme", "Un dîner aux chandelles", "Cela dépend du référentiel"],
  },
  {
    id: "train",
    prompt: "Kant prend le train de 8 h 12, Hegel celui de 8 h 15.",
    highlight: "Lequel arrive le premier à la conclusion ?",
    options: ["Kant", "Hegel", "La dialectique", "Le contrôleur"],
  },
  {
    id: "chat",
    prompt: "Un chat est à la fois vivant et mort dans une boîte.",
    highlight: "Que faites-vous ?",
    options: ["J’ouvre la boîte", "Je n’ouvre pas la boîte", "J’appelle Schrödinger", "J’adopte un chien"],
  },
  {
    id: "ideal",
    prompt: "Quel est le pluriel d’« idéal » ?",
    options: ["Des idéaux", "Des idéals", "Les deux sont admis", "Un idéal ne se partage pas"],
  },
  {
    id: "arbre",
    prompt: "Un arbre tombe dans une forêt, personne ne l’entend.",
    highlight: "Qui rédige le rapport ?",
    options: ["Un doctorant", "Le garde forestier", "Personne, justement", "Berkeley, à titre posthume"],
  },
  {
    id: "ampoule",
    prompt: "Combien de diplômés faut-il pour changer une ampoule ?",
    options: ["Un seul, mais Bac+5", "Trois, dont un philosophe", "Aucun : un électricien", "La question est mal posée"],
  },
  {
    id: "vernissage",
    prompt: "Vous croisez votre ex à un vernissage.",
    highlight: "Quelle est la réponse la plus intelligente ?",
    options: ["Commenter l’accrochage", "Citer Spinoza", "La sortie de secours", "Saluer, en adulte"],
  },
  {
    id: "rendez-vous",
    prompt: "Le premier rendez-vous idéal se tient…",
    options: ["Dans une bibliothèque, à voix basse", "Au musée, sans audioguide", "Dans un débat contradictoire", "Là où la conversation mène"],
  },
  {
    id: "calcul",
    prompt: "Dernière question. Combien font 130 − 130 + 130 ?",
    options: ["130", "Cent trente", "CXXX", "Je vois où vous voulez en venir"],
  },
];

export const QUIZ_COPY = {
  intro: {
    badge: "QI ≥ 130",
    kicker: "Épreuve unique",
    title: "Test d’admission",
    lead: "Trois minutes pour prouver ce que votre diplôme dit déjà.",
    facts: [
      { value: "10", label: "questions" },
      { value: "3 min", label: "chrono en main" },
      { value: "Interdite", label: "calculatrice" },
      { value: "Garanti", label: "résultat", highlight: true },
    ] satisfies QuizFact[],
    disclaimer:
      "Test non scientifique. Aucune réponse n’est enregistrée, et il n’a aucun lien avec l’admission : pour entrer à Sapios, seul le diplôme compte.",
    start: "Commencer le test",
  },
  question: {
    counter: (n: number, total: number) => `Question ${n} sur ${total}`,
    noted: "Réponse notée. Elles le sont toutes.",
    next: "Question suivante",
    last: "Voir mon résultat",
    timeUp: "Temps écoulé. Cela ne change rien au résultat.",
    quit: "Quitter le test",
  },
  computing: {
    title: "Correction en cours",
    steps: ["Lecture de vos réponses", "Comparaison avec Einstein", "Relecture des copies de Kant", "Arrondi à la hausse"],
  },
  result: {
    label: "QI estimé",
    badge: "Admis au test",
    title: "Comme tout le monde ici.",
    subtitle: "Nous ne prenons pas les autres.",
    disclaimer:
      "Test non scientifique : le résultat est le même pour tous et rien n’est enregistré. Votre vraie note, c’est votre diplôme.",
    share: "Partager mon résultat",
    apply: "Postuler pour de vrai",
    retry: "Repasser le test",
    retryHint: "Le résultat ne changera pas.",
  },
  share: {
    badge: "Test d’admission",
    title: "Test d’admission Sapios",
    text: "QI estimé : 130. Comme tout le monde ici.",
    footer: "Test non scientifique. Le diplôme, lui, est vérifié.",
  },
} as const;

export const QUIZ = {
  /** Le seul résultat possible. */
  score: 130,
  durationSeconds: 180,
  questions: QUIZ_QUESTIONS,
  copy: QUIZ_COPY,
} as const;
