// A curated checklist of recognised Gestalt therapy terms.
//
// This is NOT an authority on definitions or seminal authors — it is only a
// vocabulary list, used to:
//   1. raise a citation's term-confidence to HIGH when the guessed term matches
//   2. badge a term as "new" when it does not match (so a curator eyeballs it)
//   3. power autocomplete in the review screen so contributors converge on one
//      spelling instead of inventing variants
//
// Add terms freely as the registry grows. Keep entries lowercase; the matcher
// normalises punctuation and a few common variants.

export const GESTALT_CONCEPTS: string[] = [
  // Whole / form / field
  "gestalt", "figure", "ground", "figure/ground", "figure formation",
  "gestalt formation", "gestalt formation and destruction", "closure",
  "prägnanz", "pragnanz", "holism", "the whole", "field", "field theory",
  "organism/environment field", "the situation", "differentiation",

  // Phenomenology / dialogue
  "phenomenology", "phenomenological method", "phenomenological attitude",
  "bracketing", "epoché", "epoche", "phenomenological reduction",
  "horizontalism", "the phenomenological method", "description",
  "dialogue", "dialogical relationship", "dialogic relationship",
  "i-thou", "i-thou relation", "i-it", "inclusion", "presence", "confirmation",
  "commitment to dialogue", "the between", "meeting", "existential encounter",

  // Contact
  "contact", "contact boundary", "the contact boundary", "contacting",
  "contact cycle", "cycle of experience", "cycle of contact",
  "fore-contact", "forecontact", "final contact", "post-contact",
  "contact and withdrawal", "withdrawal", "contact functions",
  "contact style", "contact styles", "modes of contact",
  "moderations to contact", "interruptions to contact",
  "boundary", "boundary disturbance", "boundary disturbances",
  "loss of ego function",

  // Moderations / resistances to contact
  "introjection", "introject", "projection", "retroflection",
  "retroflection of aggression", "deflection", "confluence", "egotism",
  "desensitisation", "desensitization", "proflection",

  // Self
  "self", "self-function", "id function", "ego function", "personality function",
  "the self", "self-process", "creative adjustment", "creative indifference",
  "middle mode", "spontaneity", "self-regulation", "organismic self-regulation",

  // Awareness
  "awareness", "awareness continuum", "the awareness continuum",
  "zones of awareness", "inner zone", "outer zone", "middle zone",
  "here and now", "the here and now", "present-centredness",
  "present moment", "present-moment focus", "the now", "actuality",
  "awareness of awareness",

  // Need / regulation / change
  "dominant need", "hierarchy of needs", "figure of interest",
  "unfinished business", "unfinished situation", "fixed gestalt",
  "fixed gestalten", "stuck point", "impasse", "the impasse",
  "safe emergency", "paradoxical theory of change",
  "homeostasis", "assimilation", "aggression", "dental aggression",
  "destructuring", "hunger instinct",

  // Experiment / technique
  "experiment", "the experiment", "experimentation", "enactment",
  "exaggeration", "reversal", "rehearsal", "empty chair", "empty-chair",
  "two-chair work", "two-chair", "top dog", "under dog", "topdog/underdog",
  "topdog", "underdog", "polarities", "polarisation", "polarization",
  "integration", "disowned parts", "making the rounds", "staying with",
  "the reversal technique", "amplification",

  // Support / relationship
  "support", "self-support", "environmental support", "response-ability",
  "responsibility", "working alliance", "therapeutic relationship",
  "the therapeutic relationship", "grounding", "confluence in relationship",

  // Body / process
  "embodiment", "embodied process", "body process", "character",
  "character structure", "muscular armour", "muscular armor", "energy",
  "mobilisation", "mobilization", "proprioception",
  "process", "process not content", "figure/ground formation",

  // Awareness / method slogans that function as terms
  "aboutism", "shouldism", "creative adjustment to the field",
  "confluence and difference", "the paradoxical theory of change",
];

// --- matching --------------------------------------------------------------

/** Loose normalisation for comparing two term strings (accents, punctuation,
 *  "and", a leading "the", plural/gerund tails are all ignored by callers). */
export function normaliseTerm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[/\-–—]/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALISED = new Set(GESTALT_CONCEPTS.map(normaliseTerm));

/** True when two term strings refer to the same concept (loose match). */
export function sameTerm(a: string, b: string): boolean {
  const na = normaliseTerm(a);
  const nb = normaliseTerm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const stem = (x: string) => x.replace(/s$/, "").replace(/ing$/, "");
  return stem(na) === stem(nb);
}

/** True when `term` is (or closely matches) a term on the checklist. */
export function isKnownConcept(term: string): boolean {
  if (!term) return false;
  const n = normaliseTerm(term);
  if (!n) return false;
  if (NORMALISED.has(n)) return true;
  // tolerate a trailing plural or gerund ("experiments" -> "experiment")
  const singular = n.replace(/s$/, "").replace(/ing$/, "");
  return NORMALISED.has(singular) || NORMALISED.has(n.replace(/ing$/, "e"));
}

/** The display list for autocomplete (deduped, original casing, sorted). */
export const CONCEPT_SUGGESTIONS: string[] = [...new Set(GESTALT_CONCEPTS)]
  .filter((t) => !t.includes("/"))
  .sort((a, b) => a.localeCompare(b));
