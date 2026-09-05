import { isKnownConcept } from "./gestaltConcepts";

// Harvard-style citation extraction.
// Handles in-text citations like:
//   (Parlett, 1991)
//   (Parlett, 1991, p. 70)
//   (Parlett, 1991: 70)
//   (Yontef & Jacobs, 2005, pp. 12-14)
//   (Perls et al., 1951, p. 227)
//   (Parlett, 1991; Yontef, 1993)
// And reference-list entries like:
//   Parlett, M. (1991) 'Reflections on Field Theory', British Gestalt Journal, 1, pp. 69-81.

export type InTextCitation = {
  authors: string;          // raw author string as written in the paren (e.g. "Perls et al.")
  firstAuthorLastName: string; // normalized for matching ("Perls"); "" when it must be resolved against the reference list
  authorCandidates: string[]; // surnames to try against the reference list, nearest-first (loose narrative form)
  year: number;
  page: string | null;
  rawMatch: string;         // the full "(...)" as found
  contextBefore: string;    // up to ~12 words before the open paren (raw)
  guessedTerm: string;      // best single term guess (termCandidates[0])
  termCandidates: string[]; // ordered best-first, for the reviewer to pick from
  topStrong: boolean;       // leading candidate came from an explicit-naming signal
};

export type ReferenceEntry = {
  raw: string;
  firstAuthorLastName: string;
  year: number;
  author: string;           // e.g. "Parlett, M."
  article_title: string | null;
  source: string | null;
};

export type ExtractedCitation = {
  term: string;              // best guess (termCandidates[0] ?? "")
  termCandidates: string[];  // clickable options for the reviewer
  confidence: "high" | "low"; // low = weak term guess, likely a claim not a concept
  author: string;
  year: number;
  page: string | null;
  article_title: string | null;
  source: string | null;
  contextBefore: string;
  matchedReference: boolean;
};

const STOPWORDS = new Set([
  "the","a","an","of","to","in","on","at","by","for","with","as","and","or","but","is","are","was","were",
  "that","this","these","those","it","its","their","there","he","she","they","we","you","i","his","her",
  "our","your","my","be","been","being","have","has","had","do","does","did","not","no","so","than","then",
  "from","into","about","over","under","between","among","through","such","also","however","therefore",
  "called","term","concept","notion","idea","see","cf","e.g.","i.e.","eg","ie",
]);

function stripTrailingPunct(s: string) {
  return s.replace(/[\s.,;:!?()'"‘’“”]+$/g, "");
}
function stripLeadingPunct(s: string) {
  return s.replace(/^[\s.,;:!?()'"‘’“”]+/g, "");
}

export function guessTerm(contextBefore: string): string {
  // Take up to the last 8 words before the paren.
  const words = contextBefore
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => stripTrailingPunct(stripLeadingPunct(w)))
    .filter(Boolean);

  if (words.length === 0) return "";

  // Walk backwards, collect trailing content words (non-stopwords), stop when we hit a stopword or sentence break.
  const collected: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    const lower = w.toLowerCase();
    // sentence break heuristic: prior word ended with a period we already stripped; if original contained "." before this word, stop.
    if (/^[A-Z]/.test(w) && collected.length > 0 && lower !== w.toLowerCase()) {
      // allow capitalized continuation (e.g. proper nouns) — do nothing special
    }
    if (STOPWORDS.has(lower)) {
      if (collected.length === 0) continue; // skip trailing stopwords
      break;
    }
    collected.unshift(w);
    if (collected.length >= 3) break;
  }
  return collected.join(" ").toLowerCase();
}

// --- Section headings ------------------------------------------------------
// Structural headings that are never a Gestalt term.
const STRUCTURAL_HEADINGS = new Set([
  "abstract", "introduction", "conclusion", "references", "bibliography",
  "contents", "table of contents", "acknowledgements", "acknowledgments",
  "appendix", "appendices", "methodology", "method", "methods", "results",
  "discussion", "findings", "summary", "overview", "background", "literature review",
]);

export type Heading = { index: number; text: string };

// Detect section headings from extracted text: a short standalone line with no
// sentence punctuation, not a table-of-contents dotted line, followed by prose.
export function findHeadings(text: string): Heading[] {
  const out: Heading[] = [];
  let offset = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    offset += line.length + 1; // + "\n"
    const t = line.trim();
    if (t.length < 2 || t.length > 64) continue;
    if (/\.{3,}/.test(t)) continue;                 // "Contact......... 5" (TOC)
    if (/[.,;:]$/.test(t)) continue;                // ends mid-sentence / sentence
    if (/\((?:1[5-9]\d{2}|20\d{2}|21\d{2})/.test(t)) continue; // contains a citation
    if (/^[0-9\W]+$/.test(t)) continue;             // page number / rule
    const words = t.split(/\s+/);
    if (words.length > 9) continue;
    if (!/^[A-Z‘'"(]/.test(t)) continue;
    // next non-empty line should begin a sentence (paragraph body)
    let next = "";
    for (let j = i + 1; j < lines.length && j < i + 4; j++) {
      if (lines[j].trim()) { next = lines[j].trim(); break; }
    }
    if (next && !/^[A-Z‘'"(]/.test(next)) continue;
    out.push({ index: lineStart + (line.length - line.trimStart().length), text: t });
  }
  return out;
}

function nearestHeading(headings: Heading[], at: number): Heading | null {
  let best: Heading | null = null;
  for (const h of headings) {
    if (h.index <= at && (!best || h.index > best.index)) best = h;
  }
  return best;
}

function headingTerm(h: Heading | null): string | null {
  if (!h) return null;
  const norm = h.text.toLowerCase().replace(/[:.]+$/, "").trim();
  if (STRUCTURAL_HEADINGS.has(norm)) return null;
  // Only use a heading that reads like a term: <=3 words, no colon, not a
  // "Defining X" / "Heightening X" / "Conditions for X" section title.
  if (norm.includes(":")) return null;
  if (norm.split(/\s+/).length > 3) return null;
  if (/^(defining|heightening|exploring|understanding|conditions?|introduction|towards?|approaches?)\b/.test(norm)) return null;
  if (/\b(of|for|to|in|and)\b/.test(norm)) return null;
  return norm;
}

// --- Term candidates ------------------------------------------------------
const TERM_STOP_PREFIX =
  /^(?:the|a|an|this|that|these|those|his|her|their|its|our|my|your|such|kind of|type of|form of|what|which)\s+/i;

const TERM_EDGE_JUNK = /^(where|which|while|when|whom|whose|that|and|or|of|to|in|by|as|is|are)$/;

// Single generic words that are never a useful lexicon term on their own.
const BAD_SINGLE_TERMS = new Set([
  "use", "experience", "naming", "situation", "founding", "what", "thing", "things",
  "example", "process", "way", "ways", "concept", "idea", "work", "point", "part",
  "kind", "form", "type", "sense", "view", "order", "need", "result", "aspect",
  "dimension", "element", "feature", "practice", "approach", "model", "method",
  "attention", "focus", "difference", "understanding", "exploration", "emphasized",
]);

// Words that mark a phrase as a claim/action rather than a named concept.
const CLAIM_WORDS = new Set([
  "deepen", "deepens", "emerge", "emerges", "emerging", "flourish", "flourishes",
  "allow", "allows", "allowing", "enable", "enables", "enabling", "support",
  "supports", "reflect", "reflects", "reflecting", "notice", "notices", "noticing",
  "attend", "attends", "attending", "happen", "happens", "occur", "occurs",
  "become", "becomes", "becoming", "arise", "arises", "arising", "develop",
  "develops", "developing", "generate", "generates", "generative", "heighten",
  "heightens", "heightening", "exaggerate", "suspend", "describe", "describes",
  "organise", "organize", "interpret", "explore", "explores", "exploring",
  "increase", "increases", "increasing", "create", "creates", "creating",
]);
// "to emerge", "can be generative", "that allows", "which deepens" ...
const CLAIMY_PHRASE =
  /\b(?:to|can|could|may|might|will|would|should|must|be|being|been)\s+\w+|\b(?:that|which|where|when|whereby|whilst|allowing|enabling)\b/i;

function looksLikeClaim(s: string): boolean {
  if (CLAIMY_PHRASE.test(s)) return true;
  return s.split(/\s+/).some((w) => CLAIM_WORDS.has(w.toLowerCase()));
}

function cleanTerm(s: string): string {
  let out = s
    .toLowerCase()
    .replace(/['’]s\b/g, "")                        // "yontef's" -> "yontef" (then dropped as junk)
    .replace(/[\s.,;:!?()'"‘’“”]+$/g, "")
    .replace(/^[\s.,;:!?()'"‘’“”]+/g, "")
    .replace(TERM_STOP_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
  // Trim dangling function words from either end ("whole people where" -> "whole people").
  let words = out.split(" ");
  while (words.length > 1 && TERM_EDGE_JUNK.test(words[words.length - 1])) words.pop();
  while (words.length > 1 && TERM_EDGE_JUNK.test(words[0])) words.shift();
  return words.join(" ");
}

function isUsefulTerm(s: string): boolean {
  if (s.length < 2 || s.length > 48) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  if (words.every((w) => STOPWORDS.has(w.toLowerCase()))) return false;
  if (TERM_EDGE_JUNK.test(words[words.length - 1]) || TERM_EDGE_JUNK.test(words[0])) return false;
  if (words.length === 1 && BAD_SINGLE_TERMS.has(words[0])) return false;
  if (/^\d/.test(s)) return false;
  if (looksLikeClaim(s)) return false;
  return true;
}

// Build an ordered, deduped set of candidate terms for one citation.
// `before` ends at the citation (already scoped to the current section);
// `after` starts just past it. Ordered best-first for a term registry.
// `topStrong` is true when the leading candidate came from an explicit-naming
// signal (apposition / "defined as" / quoted term / heading) rather than a
// bare word-grab, which feeds the HIGH/LOW confidence rating.
function buildTermCandidates(
  before: string,
  after: string,
  heading: string | null
): { candidates: string[]; topStrong: boolean } {
  const flatBefore = before.replace(/\s+/g, " ")
    // drop an intervening "(i.e., ...)" / "(e.g. ...)" gloss between term and cite
    .replace(/\s*\((?:i\.?e\.?|e\.?g\.?|cf\.?)[^)]*\)\s*$/i, " ")
    .trim();
  const flatAfter = after.replace(/\s+/g, " ").trim();
  const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;
  // Framing text = the author's own words, with any trailing quotation and any
  // block-quote (a lead-in ending ":") removed, so the sentence-subject / words-
  // before heuristics look at framing rather than at quoted source material.
  let flatBeforeFraming = flatBefore
    .replace(/['‘][^'’]+['’][^'’]{0,20}$/, " ")
    .replace(/:\s+[A-Z][\s\S]*$/, " ")
    // "...definition of awareness is Gary Yontef's" / "...detailed by Eva Gold"
    .replace(/\s+(?:is|by|of|per|following|according to)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}['’]?s?\s*$/, " ")
    .trim();
  if (flatBeforeFraming.length < 12) flatBeforeFraming = flatBefore;

  const cands: { term: string; strong: boolean }[] = [];
  const push = (raw: string | null | undefined, strong: boolean) => {
    if (!raw) return;
    const c = cleanTerm(raw);
    if (isUsefulTerm(c) && !cands.some((x) => x.term === c)) cands.push({ term: c, strong });
  };

  // A. Apposition right after the cite: "(cite) or contact is ..." — an explicit naming.
  const apposition = flatAfter.match(/^\s*or\s+([A-Za-z][A-Za-z '–-]{2,40}?)(?:\s+(?:is|are|was|which|that|and)\b|[.,;])/i);
  if (apposition) push(apposition[1], true);

  // B. "X is/are defined (simply) as | X refers to | known as | called | termed"
  const definedAs = flatBefore.match(
    /([A-Za-z][A-Za-z '–-]{2,40}?)\s+(?:(?:is|are|was|were)\s+(?:simply\s+|often\s+|generally\s+)?(?:defined\s+(?:simply\s+)?as|referred to as|known as|termed|called)|refers?\s+to|means)\b/i
  );
  if (definedAs) push(definedAs[1].split(/[,.;:]/).pop(), true);

  // C. "refer(red) to as X" | "naming (the) 'X'" | "concept/notion of X" | "the term X"
  const namedAfterPhrase = flatBefore.match(
    /(?:refer(?:red|s)? to as|naming(?:\s+the)?|concept of|notion of|the term)\s+['‘]?([A-Za-z][A-Za-z '–-]{2,45}?)['’]?\s*$/i
  );
  if (namedAfterPhrase) push(namedAfterPhrase[1], true);

  // D. Short quoted phrase immediately before the cite ("'meeting of difference'").
  //    Long quotes are source quotations, not the term — skip those here.
  const quotedBefore = flatBefore.match(/['‘]([^'’]{3,60})['’]\s*$/);
  if (quotedBefore) {
    const q = quotedBefore[1].trim();
    if (wc(q) <= 4) push(q, true);
    else {
      const qSubject = q.match(/^([A-Za-z][A-Za-z '–-]{2,32}?)\s+(?:is|are|was|were|involves|means|refers)\b/i);
      if (qSubject) push(qSubject[1], true);
    }
  }

  // D2. Block quote: a lead-in ending ":" then a quoted-clause subject
  //     ("...Yontef's: Full awareness is the process ...").
  const blockQuote = flatBefore.match(/:\s+([A-Z][A-Za-z '–-]{2,40}?)\s+(?:is|are|involves|means|refers)\b/);
  if (blockQuote) push(blockQuote[1], true);

  // E. Subject of the sentence containing the cite.
  const sentence = flatBeforeFraming.replace(/^.*(?:[.!?]["'’”)]?\s+)(?=[A-Z])/, "");
  const subject = sentence
    .replace(/^(?:In |When |While |Given that |Although |Because |Moreover, |However, |Lastly, |Beyond [^,]+, |This kind of |Take |Stating that )/i, "")
    .match(/^([A-Za-z][A-Za-z '–-]{2,40}?)\s+(?:is|are|was|were|has|have|posits|describes?|allows?|invites?|emerges?|involves?|can|often|also|directly)\b/i);
  if (subject) push(subject[1], false);

  // F. Words immediately before the cite (original heuristic), on framing text.
  push(guessTerm(flatBeforeFraming), false);

  // G. Nearest section heading (already filtered to term-shaped headings).
  push(heading, true);

  // Drop a candidate that is fully contained in an earlier, more specific
  // (<=4-word) candidate — e.g. drop "difference" when "meeting of difference"
  // already leads. Keep more-specific extensions of an earlier candidate.
  const kept: { term: string; strong: boolean }[] = [];
  for (const c of cands) {
    if (kept.some((k) => k.term !== c.term && k.term.includes(c.term) && wc(k.term) <= 4)) continue;
    kept.push(c);
  }
  const top = kept.slice(0, 4);
  return { candidates: top.map((c) => c.term), topStrong: top[0]?.strong ?? false };
}

// Splits "Perls, Hefferline & Goodman" or "Perls et al." -> first author last name.
function extractFirstLastName(authorsRaw: string): string {
  const cleaned = authorsRaw.replace(/\bet al\.?/gi, "").trim();
  // Take text before the first comma, semicolon, "and", "&"
  const parts = cleaned.split(/,|;|\sand\s|\s&\s/i);
  const first = (parts[0] ?? "").trim();
  // If author was "Perls, F." we already split on comma; the part before is the last name.
  // If author was "F. Perls" take the last token.
  if (!first) return "";
  const tokens = first.split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  return (last ?? "").replace(/[^A-Za-z'À-ɏ-]/g, "");
}

const IN_TEXT_RE = /\(([^()]*?\d{4}[^()]*?)\)/g;

// Narrative citation: author name sits immediately before `(YYYY...)`.
// Matches trailing forms like "Fodor", "Eva Gold", "Fodor et al.",
// "Fodor and Smith", "Fodor & Smith", "Perls, Hefferline and Goodman".
const NARRATIVE_AUTHOR_RE =
  /([A-Z][A-Za-zÀ-ɏ'-]+(?:\s+[A-Z][A-Za-zÀ-ɏ'-]+){0,2}(?:\s+et\s+al\.?)?(?:\s*(?:,\s*|\s+(?:and|&)\s+)[A-Z][A-Za-zÀ-ɏ'-]+(?:\s+[A-Z][A-Za-zÀ-ɏ'-]+){0,2})*)\s*$/;

function extractNarrativeAuthor(
  textBeforeParen: string
): { author: string; start: number } | null {
  const stripped = textBeforeParen.replace(/\s+$/, "");
  const m = stripped.match(NARRATIVE_AUTHOR_RE);
  if (!m) return null;
  return { author: m[1], start: m.index ?? 0 };
}

// Loose narrative form: a bare "(1951)" whose author sits several words earlier,
// e.g. "...what Perls, Hefferline and Goodman (PHG) refer to as zones of
// awareness (1951)". Collect candidate surnames from the preceding sentence,
// nearest-first. These are only trusted if the reference list confirms them.
const LOOSE_AUTHOR_RE =
  /([A-Z][A-Za-zÀ-ɏ'-]{2,}(?:\s+(?:and|&)\s+[A-Z][A-Za-zÀ-ɏ'-]{2,}| et al\.?)?)(?:\s*\([A-Z]{2,6}\))?/g;

function looseAuthorCandidates(textBeforeParen: string): string[] {
  // stay within the current sentence
  const sentence = textBeforeParen.replace(/^[\s\S]*[.!?]\s+/, "");
  const names: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LOOSE_AUTHOR_RE);
  while ((m = re.exec(sentence)) !== null) {
    const last = extractFirstLastName(m[1]);
    if (last && !names.includes(last)) names.push(last);
  }
  return names.reverse(); // nearest to the citation first
}

export function extractInText(essay: string): InTextCitation[] {
  const out: InTextCitation[] = [];
  const headings = findHeadings(essay);
  let m: RegExpExecArray | null;
  const re = new RegExp(IN_TEXT_RE);
  while ((m = re.exec(essay)) !== null) {
    const inside = m[1];
    const start = m.index;
    const parenEnd = start + m[0].length;
    const contextStart = Math.max(0, start - 200);
    const contextBefore = essay.slice(contextStart, start);
    const hd = nearestHeading(headings, start);
    const heading = headingTerm(hd);
    // Scope the "before" window to the current section so a preceding heading
    // or earlier paragraph can't leak into the term guess.
    const beforeFloor = Math.max(0, start - 420, hd ? hd.index + hd.text.length : 0);
    const windowBefore = essay.slice(beforeFloor, start);
    const windowAfter = essay.slice(parenEnd, parenEnd + 200);

    // Split grouped citations by semicolon: "(Parlett, 1991; Yontef, 1993)"
    const chunks = inside.split(";").map((c) => c.trim()).filter(Boolean);
    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const yearMatch = chunk.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})([a-z]?)\b/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[1], 10);

      let beforeYear = chunk.slice(0, yearMatch.index).replace(/[,\s]+$/, "").trim();
      const afterYear = chunk.slice((yearMatch.index ?? 0) + yearMatch[0].length).trim();

      // Extract page / locator info from afterYear:
      //   "p. 70", "pp. 69-81", ": 70", ", 70"        -> numeric page
      //   "ch. 5, para. 62", "para. 5", "loc. 1200"   -> ebook locator, kept verbatim
      let page: string | null = null;
      const pageMatch = afterYear.match(/(?:pp?\.?\s*|:\s*|,\s*)(\d+(?:\s*[-–]\s*\d+)?)/);
      if (pageMatch) {
        page = pageMatch[1].replace(/\s+/g, "");
      } else {
        const locMatch = afterYear.match(
          /\b(?:ch(?:ap(?:ter)?)?\.?|para(?:graph)?\.?|sec(?:t(?:ion)?)?\.?|loc(?:ation)?\.?|§)\s*\d+(?:\s*,\s*(?:para(?:graph)?\.?|§)\s*\d+)?/i
        );
        if (locMatch) page = locMatch[0].replace(/\s+/g, " ").trim();
      }

      let effectiveContext = contextBefore;
      let effectiveBefore = windowBefore;
      let authorCandidates: string[] = [];
      if (!beforeYear) {
        // Narrative form: author is outside the parens.
        // Only the first chunk can be narrative — grouped citations after a
        // semicolon always carry their own author.
        if (chunkIdx !== 0) continue;
        const narrative = extractNarrativeAuthor(contextBefore);
        if (narrative) {
          beforeYear = narrative.author;
          effectiveContext = contextBefore.slice(0, narrative.start).replace(/[,\s]+$/, "");
          effectiveBefore = windowBefore.slice(0, windowBefore.length - (contextBefore.length - narrative.start));
        } else {
          // Loose narrative: author is further back. Defer to reference-list check.
          authorCandidates = looseAuthorCandidates(contextBefore);
          if (authorCandidates.length === 0) continue;
        }
      }

      const firstAuthorLastName = beforeYear ? extractFirstLastName(beforeYear) : "";
      if (!firstAuthorLastName && authorCandidates.length === 0) continue;

      const { candidates: termCandidates, topStrong } = buildTermCandidates(
        effectiveBefore,
        windowAfter,
        heading
      );

      out.push({
        authors: beforeYear,
        firstAuthorLastName,
        authorCandidates,
        year,
        page,
        rawMatch: m[0],
        contextBefore: effectiveContext.slice(-120),
        guessedTerm: termCandidates[0] ?? "",
        termCandidates,
        topStrong,
      });
    }
  }
  return out;
}

// Find the References section heading. Accepts the heading on its own line OR
// glued to preceding non-letter text (e.g. "Word Count: 2075References\n..."),
// which happens when .docx / .pdf extraction collapses a line break. The
// heading is only accepted when it's followed by something that looks like a
// reference entry, so prose like "see References below" won't false-match.
// Returns position info for both the heading itself and the content that
// follows. Uses the last valid occurrence.
export function findReferencesSection(
  essay: string
): { headingStart: number; contentStart: number } | null {
  const headingRe = /(References|Bibliography|Works\s+Cited|Reference\s+List)\b\s*:?/g;
  let m: RegExpExecArray | null;
  let best: { headingStart: number; contentStart: number } | null = null;
  while ((m = headingRe.exec(essay)) !== null) {
    // Reject matches that are suffixes of a larger word (e.g. "Preferences").
    const prev = m.index > 0 ? essay[m.index - 1] : "\n";
    if (/[A-Za-z]/.test(prev)) continue;
    const end = m.index + m[0].length;
    const rest = essay.slice(end).replace(/^\s+/, "");
    // Must be followed by something shaped like "Surname, X." to count.
    if (!/^[A-Z][A-Za-z'À-ɏ-]+,\s/.test(rest)) continue;
    best = { headingStart: m.index, contentStart: end };
  }
  return best;
}

export function extractReferences(essay: string): ReferenceEntry[] {
  const section = findReferencesSection(essay);
  if (!section) return [];
  let refsBlock = essay.slice(section.contentStart).trim();
  if (!refsBlock) return [];

  // Strip page-break debris that PDF extraction leaves between entries:
  // bare page numbers ("11") and page markers ("-- 12 of 13 --").
  refsBlock = refsBlock
    .split("\n")
    .filter((l) => !/^\s*\d{1,4}\s*$/.test(l) && !/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i.test(l))
    .join("\n");

  // An author-date reference entry begins with "Surname, X." (initial) or
  // "Surname, Firstname" — optionally more of the same joined by "and"/"&"/",".
  // Split on a blank line OR a newline immediately before that pattern. This is
  // deliberately strict so a mid-entry line wrap like "Gestalt\nReview, 2(1)"
  // ("Review," looks like a surname) does NOT start a new entry.
  const ENTRY_START = /[A-Z][A-Za-z'’À-ɏ-]+,\s+[A-Z](?:\.|[a-z]+\b)/;
  const rawEntries: string[] = refsBlock
    .split(new RegExp(`\\n\\s*\\n|\\n(?=${ENTRY_START.source})`))
    .map((s) => s.trim())
    .filter(Boolean)
    // Drop fragments with no year paren (stray wrapped lines, headers).
    .filter((s) => /\((1[5-9]\d{2}|20\d{2}|21\d{2})/.test(s));

  const out: ReferenceEntry[] = [];
  for (const raw of rawEntries) {
    const flat = raw.replace(/\s+/g, " ").trim();
    // Year may be followed by a bracketed original-publication year, e.g.
    // "Buber, M. (2004 [1923]) I and Thou." — take the outer year.
    const yearMatch = flat.match(/\((1[5-9]\d{2}|20\d{2}|21\d{2})[a-z]?(?:\s*\[\d{4}\])?\s*\)/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);
    const authorPart = flat.slice(0, yearMatch.index).replace(/[,\s]+$/, "").trim();
    const afterYear = flat.slice((yearMatch.index ?? 0) + yearMatch[0].length).trim().replace(/^[\s.,:;]+/, "");

    // Try to split title / source. Title often in quotes or italics; Harvard uses single quotes.
    let article_title: string | null = null;
    let source: string | null = null;
    const quoted = afterYear.match(/['‘]([^'’]+)['’]/);
    if (quoted) {
      article_title = quoted[1].trim();
      const rest = afterYear.slice((quoted.index ?? 0) + quoted[0].length).replace(/^[\s,\.]+/, "").trim();
      // Edited-book chapter: "in Editor, X. (ed.) Book Title. City: Publisher, pp. X-Y."
      const editedMatch = rest.match(/\bin\s+[^(]+?\(eds?\.?\)\s+([^.]+?)(?=\.(?:\s|$))/i);
      // Plain "in Book Title." — chapter without explicit (ed.)
      const inMatch = !editedMatch ? rest.match(/^in\s+([^.]+?)(?=\.(?:\s|$))/i) : null;
      if (editedMatch) {
        source = editedMatch[1].trim();
      } else if (inMatch) {
        source = inMatch[1].trim();
      } else {
        // Journal or similar — up to first comma / pp. / end-period.
        const srcMatch = rest.match(/^([^,]+?)(?:,|\bpp?\.|\.$)/);
        source = (srcMatch ? srcMatch[1] : rest).trim().replace(/[.,]$/, "") || null;
      }
    } else {
      // No quoted title; afterYear is usually "Book Title. Edition. City: Publisher."
      // Split on the first sentence-period only, so titles containing commas
      // ("Awareness, Dialogue and Process") or colons survive intact.
      const firstSeg = afterYear.split(/\.(?:\s+|$)/)[0]?.trim();
      source = firstSeg ? firstSeg.replace(/[.,]+$/, "") : null;
      article_title = null;
    }

    const firstAuthorLastName = extractFirstLastName(authorPart);
    if (!firstAuthorLastName) continue;

    out.push({
      raw,
      firstAuthorLastName,
      year,
      author: authorPart,
      article_title,
      source,
    });
  }
  return out;
}

// Find "Perls, Hefferline and Goodman (PHG)" style introductions and map the
// acronym back to the first author's surname, so later "(PHG, 1951)" cites can
// reconcile with the reference list.
export function extractAcronymMap(essay: string): Map<string, string> {
  const out = new Map<string, string>();
  const re =
    /([A-Z][A-Za-zÀ-ɏ'-]+(?:\s*(?:,\s*|\s+(?:and|&)\s+)[A-Z][A-Za-zÀ-ɏ'-]+){1,5})\s*\(([A-Z]{2,6})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(essay)) !== null) {
    const first = extractFirstLastName(m[1]);
    if (first) out.set(m[2].toLowerCase(), first);
  }
  return out;
}

export function extractCitations(essay: string): ExtractedCitation[] {
  // Scan body only for in-text citations; otherwise "(Original work published
  // 1923)" inside a ref entry gets picked up as a bogus in-text cite.
  const section = findReferencesSection(essay);
  const body = section ? essay.slice(0, section.headingStart) : essay;
  const inText = extractInText(body);
  const refs = extractReferences(essay);
  const acronyms = extractAcronymMap(body);

  const refFor = (lastName: string, year: number): ReferenceEntry | undefined => {
    const lower = lastName.toLowerCase();
    const lookup = (acronyms.get(lower) ?? lower).toLowerCase();
    return refs.find(
      (r) => r.firstAuthorLastName.toLowerCase() === lookup && r.year === year
    );
  };

  // Resolve the author for each citation. Loose-narrative citations (no author
  // adjacent to the year) are only kept when the reference list confirms one of
  // their candidate surnames — this is the guard against misattribution.
  type Resolved = InTextCitation & { ref?: ReferenceEntry; resolvedName: string };
  const resolved: Resolved[] = [];
  for (const c of inText) {
    if (c.firstAuthorLastName) {
      resolved.push({ ...c, ref: refFor(c.firstAuthorLastName, c.year), resolvedName: c.firstAuthorLastName });
      continue;
    }
    const hit = c.authorCandidates
      .map((name) => ({ name, ref: refFor(name, c.year) }))
      .find((x) => x.ref);
    if (!hit) continue; // unconfirmed loose citation — drop rather than guess
    resolved.push({ ...c, ref: hit.ref, resolvedName: hit.name, authors: hit.ref!.author });
  }

  // Dedupe by (author | year | page/locator | best term). The same source cited
  // for different concepts stays as separate rows — a term registry wants both
  // "unfinished business -> PHG 1951" and "present-moment focus -> PHG 1951".
  // When two collapse, merge their candidate lists so the reviewer sees every option.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const map = new Map<string, Resolved>();
  for (const c of resolved) {
    const lower = c.resolvedName.toLowerCase();
    const name = (acronyms.get(lower) ?? lower).toLowerCase();
    const key = `${name}|${c.year}|${c.page ?? ""}|${norm(c.guessedTerm)}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, c);
    } else {
      const merged = [...prev.termCandidates];
      for (const t of c.termCandidates) if (!merged.some((x) => norm(x) === norm(t))) merged.push(t);
      map.set(key, { ...prev, termCandidates: merged.slice(0, 5) });
    }
  }

  const out: ExtractedCitation[] = [];
  for (const c of map.values()) {
    let candidates = c.termCandidates;
    let fromTitle = false;
    // Last resort: if nothing was guessed, offer a term from the article title.
    if (candidates.length === 0 && c.ref?.article_title) {
      const head = c.ref.article_title.split(/[:—–]/)[0].trim();
      const conjunct = /\band\b/.test(head) ? head.split(/\s+and\s+/i).pop()!.trim() : head;
      const t = cleanTerm(conjunct.split(/\s+/).length <= 3 ? conjunct : head);
      if (isUsefulTerm(t)) { candidates = [t]; fromTitle = true; }
    }
    const term = candidates[0] ?? "";
    // HIGH when the term is a recognised Gestalt concept, or came from an
    // explicit-naming signal. Everything else is LOW (likely a claim, not a term).
    const confidence: "high" | "low" =
      term && (isKnownConcept(term) || (c.topStrong && !fromTitle)) ? "high" : "low";
    out.push({
      term,
      termCandidates: candidates,
      confidence,
      author: c.ref?.author ?? c.authors,
      year: c.year,
      page: c.page,
      article_title: c.ref?.article_title ?? null,
      source: c.ref?.source ?? null,
      contextBefore: c.contextBefore,
      matchedReference: Boolean(c.ref),
    });
  }
  // Sort by term, then author
  out.sort((a, b) => (a.term || "zzz").localeCompare(b.term || "zzz") || a.author.localeCompare(b.author));
  return out;
}
