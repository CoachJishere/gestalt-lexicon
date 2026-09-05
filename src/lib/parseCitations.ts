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
  firstAuthorLastName: string; // normalized for matching ("Perls")
  year: number;
  page: string | null;
  rawMatch: string;         // the full "(...)" as found
  contextBefore: string;    // up to ~12 words before the open paren (raw)
  guessedTerm: string;      // heuristic: last noun-ish phrase before the paren
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
  term: string;
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

export function extractInText(essay: string): InTextCitation[] {
  const out: InTextCitation[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IN_TEXT_RE);
  while ((m = re.exec(essay)) !== null) {
    const inside = m[1];
    const start = m.index;
    const contextStart = Math.max(0, start - 200);
    const contextBefore = essay.slice(contextStart, start);

    // Split grouped citations by semicolon: "(Parlett, 1991; Yontef, 1993)"
    const chunks = inside.split(";").map((c) => c.trim()).filter(Boolean);
    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const yearMatch = chunk.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})([a-z]?)\b/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[1], 10);

      let beforeYear = chunk.slice(0, yearMatch.index).replace(/[,\s]+$/, "").trim();
      const afterYear = chunk.slice((yearMatch.index ?? 0) + yearMatch[0].length).trim();

      // Extract page info from afterYear: "p. 70", "pp. 69-81", ": 70", ", 70"
      let page: string | null = null;
      const pageMatch = afterYear.match(/(?:pp?\.?\s*|:\s*|,\s*)(\d+(?:\s*[-–]\s*\d+)?)/);
      if (pageMatch) page = pageMatch[1].replace(/\s+/g, "");

      let effectiveContext = contextBefore;
      if (!beforeYear) {
        // Narrative form: author is outside the parens, just before it.
        // Only the first chunk can be narrative — grouped citations after a
        // semicolon always carry their own author.
        if (chunkIdx !== 0) continue;
        const narrative = extractNarrativeAuthor(contextBefore);
        if (!narrative) continue;
        beforeYear = narrative.author;
        effectiveContext = contextBefore.slice(0, narrative.start).replace(/[,\s]+$/, "");
      }

      const firstAuthorLastName = extractFirstLastName(beforeYear);
      if (!firstAuthorLastName) continue;

      const guessed = guessTerm(effectiveContext);

      out.push({
        authors: beforeYear,
        firstAuthorLastName,
        year,
        page,
        rawMatch: m[0],
        contextBefore: effectiveContext.slice(-120),
        guessedTerm: guessed,
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
  const refsBlock = essay.slice(section.contentStart).trim();
  if (!refsBlock) return [];

  // Split into entries: blank line OR line that starts with a capital letter followed by (typical surname) after a newline.
  // Heuristic: split on blank lines first; if that yields 1 entry, fall back to splitting on newlines that precede "Surname, X." patterns.
  let rawEntries: string[] = refsBlock.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (rawEntries.length <= 1) {
    rawEntries = refsBlock
      .split(/\n(?=[A-Z][A-Za-z'À-ɏ-]+,)/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

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
      // No quoted title; whole afterYear probably "Book Title. Publisher." — treat first segment as source.
      const firstSeg = afterYear.split(/[.,]/)[0]?.trim();
      source = firstSeg || null;
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

  // Dedupe in-text by (firstAuthor|year|page) — keep the longest guessedTerm as the representative.
  const map = new Map<string, InTextCitation>();
  for (const c of inText) {
    const key = `${c.firstAuthorLastName.toLowerCase()}|${c.year}|${c.page ?? ""}`;
    const prev = map.get(key);
    if (!prev || (c.guessedTerm.length > prev.guessedTerm.length)) {
      map.set(key, c);
    }
  }

  const out: ExtractedCitation[] = [];
  for (const c of map.values()) {
    const lower = c.firstAuthorLastName.toLowerCase();
    const expanded = acronyms.get(lower);
    const lookup = expanded ? expanded.toLowerCase() : lower;
    const ref = refs.find(
      (r) => r.firstAuthorLastName.toLowerCase() === lookup && r.year === c.year
    );
    out.push({
      term: c.guessedTerm,
      author: ref?.author ?? c.authors,
      year: c.year,
      page: c.page,
      article_title: ref?.article_title ?? null,
      source: ref?.source ?? null,
      contextBefore: c.contextBefore,
      matchedReference: Boolean(ref),
    });
  }
  // Sort by term, then author
  out.sort((a, b) => (a.term || "zzz").localeCompare(b.term || "zzz") || a.author.localeCompare(b.author));
  return out;
}
