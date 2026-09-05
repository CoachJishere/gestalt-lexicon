# ADR 0002 — Term-quality and multi-contributor pollution controls

- **Status:** accepted — 2026-09-05
- **Deciders:** Jonathan Miller (with the client)

## Context

The registry is **term + citation only** (definitions dropped — see the client's
brief in `docs/PROJECT.md`). Testing against real graded essays surfaced two
problems:

1. **Not every citation maps to a term.** Some support a *claim* ("in Gestalt,
   silence can be generative… (Scotton & Kruger)") with no discrete lexicon
   entry. The parser returned junk ("deepen").
2. **Multi-contributor over-capture.** With anyone able to add, contributors will
   save vague/overarching concepts and pollute the data.

Also decided in this round:
- **Attribution is out of scope.** We considered a seminal-author backbone, but
  neither the client nor an AI can verify seminal attributions reliably (the
  client used AI for their own essay's attributions). Dropped entirely.
- **Page numbers are mandatory** on every citation.
- **Terms already in the lexicon don't need re-adding** — future uploads only
  contribute *new* terms.

## Decision

### 1. Conservative capture + confidence rating

- Shape filters reject claim/verb candidates (`deepen`, `to emerge`,
  `silence can be generative`, clause fragments).
- Every extracted row gets **`confidence: "high" | "low"`**.
  - HIGH = the term matches the known-concept list, **or** it came from an
    explicit-naming signal (apposition, "X is defined as", quoted term,
    section heading).
  - LOW = everything else (bare word-grab, sentence subject, article-title
    fallback).
- **Only HIGH-confidence, page-bearing, not-already-present rows are
  pre-checked.** LOW rows are greyed and unchecked — the contributor opts them
  in deliberately.
- **A term already in the lexicon is hard-locked** — its checkbox is disabled,
  and `handleSaveAll` filters it out regardless. Each term needs only one
  citation; future uploads contribute *new* terms only. The lock is reactive:
  editing the term (the parser matched the wrong one) re-enables the row.

### 2. Known-Gestalt-concepts list

- `src/lib/gestaltConcepts.ts` — a plain checklist of ~180 recognised terms.
  **No authors, references, or definitions** — purely vocabulary.
- Uses: (a) raise confidence to HIGH on match, (b) badge non-matching terms
  **"new term — check it's a real concept"**, (c) autocomplete (`<datalist>`)
  in every term field so contributors converge on one spelling.
- Grows freely as the registry does; lives in code, easy to edit.

### 3. Page numbers required

- Review screen: a row with no page (and no ebook chapter/paragraph locator)
  cannot be saved — amber "page number required", editable page field inline.
- Home table: entries missing a page get a **"no page"** badge.

### 4. Soft delete

- Migration `gestalt_terms_add_deleted_at` — nullable `deleted_at timestamptz`.
- Home table: a **delete** button next to Edit, with a confirm dialog. It sets
  `deleted_at` (an UPDATE — no DELETE policy needed, none exists). The row
  vanishes from the app but is recoverable.
- The app filters `deleted_at is null` everywhere it reads terms.

## Consequences

- Review screens are far quieter — on the Laura Banks essay, 5 rows pre-checked
  instead of 21; 1 flagged as already present; 7 low-confidence greyed.
- **Friction:** genuine concepts cited as whole books (PHG 1951, Buber, Husserl)
  have no page in the essay, so they're blocked from saving until a contributor
  finds one. Accepted for now; revisit if it proves too painful (e.g. require a
  page only for matched journal articles / direct quotes).
- "new term" badges are common and a bit noisy until the concept list fills out.
- Vandalism via the delete button is possible but soft-delete makes it
  recoverable; a curator cleanup path can come later if needed.
