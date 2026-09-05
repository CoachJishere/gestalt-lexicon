# Changelog

All notable changes to gestalt-lexicon.

## [Unreleased]

### 2026-09-05

- **Added** `docs/PROJECT.md` — project purpose and context (human-curated,
  crowd-contributed citation registry; antidote to AI-hallucinated citations).
- **Added** `docs/adr/0001-open-writes-in-shared-database.md` — decision to keep
  `gestalt_terms` in the shared "Murder Mystery Party Generator" Supabase project
  and re-open public writes.
- **Database** — migration `gestalt_terms_reopen_public_insert_update` on
  `mhfikaomkmqcndqfohbp`: restored public (`anon` + `authenticated`) `INSERT` and
  `UPDATE` RLS policies on `gestalt_terms`, which a 2026-05-15 security-lint pass
  had dropped (all client writes were failing with `42501`). Public `DELETE` was
  intentionally **not** restored.
- **Changed** `terms-table.tsx` — removed the per-row delete button and
  `handleDelete` (anon deletes are blocked by RLS; corrections happen via edit).
- **Added** `/upload` — a collapsible "Your essay is never stored — learn more
  about how we use your data" panel explaining what is saved (citation metadata
  only) and what is not (the essay text, ever). Short version of the same note
  added to the home page header.
- **Repo** — committed the app (previously all uncommitted), created public
  GitHub repo `CoachJishere/gestalt-lexicon`, fixed git author (`~/.gitconfig`
  `user.name` was the placeholder "Your Name" → "Jonathan Miller").

- **Changed** — force light mode (`color-scheme: light`, removed the
  `prefers-color-scheme: dark` block). The app was only ever styled for light;
  native form controls were rendering dark on dark-mode systems.
- **Fixed** — PDF uploads were returning HTTP 500. `pdf-parse` (pdfjs-dist)
  needed a bundler workaround locally and then still failed on Vercel with
  `DOMMatrix is not defined`. Replaced it with `unpdf`, which ships a
  serverless pdf.js build (no DOM globals, no worker). Verified end-to-end on
  the live site with a real essay PDF.
- **Fixed** — citation parser, from testing against a real graded essay
  (Laura Banks, "Awareness in Gestalt"):
  - ebook locators (`ch. 5, para. 62`) are captured instead of dropped;
  - a source cited at different locators no longer over-merges into one row;
  - book titles containing a comma (`Awareness, Dialogue and Process`) are no
    longer truncated;
  - PDF reference lists (no blank lines between entries, entries wrapped
    mid-line) are now split correctly — previously the whole bibliography
    collapsed into one scrambled entry (e.g. Buber's entry returned with
    Fodor's article title and Latner's source).
  - Result: the essay now extracts 16/16 citations with 16/16 reference
    matches from `.pdf`, `.docx` and pasted text alike.

- **Changed** — the registry is now **term + citation only**. Removed the
  Definition field from the add/edit form and the home table; the DB column is
  left in place but unused.
- **Added** — term-extraction now produces a ranked list of candidate terms per
  citation (apposition, "defined as", quoted phrase, block-quote subject,
  sentence subject, nearest section heading, words-before, and — as a last
  resort — the matched reference's article title). Author possessives
  ("Yontef's") are filtered out. The upload review shows candidates as
  clickable chips. On the Laura Banks essay: best candidate is right or close
  on ~17 of 21 rows; the reviewer picks a chip or types the rest.
- **Fixed** — a narrative citation whose author sits several words before the
  year ("...Goodman (PHG) refer to as zones of awareness (1951)") is now
  captured, guarded by a reference-list check so a wrong author is never
  guessed. Previously dropped.
- **Changed** — a source cited for several different concepts now yields one row
  per concept instead of collapsing to one.

- **Added** — term-quality & pollution controls (see `docs/adr/0002`):
  - `src/lib/gestaltConcepts.ts` — a ~180-term Gestalt vocabulary checklist
    (no authors/definitions). Drives confidence, "new term" badges, and
    autocomplete on every term field.
  - Every extracted citation gets `confidence: high | low`. Shape filters reject
    claim/verb guesses ("deepen", "silence can be generative").
  - Upload review: only HIGH-confidence, page-bearing, not-already-in-lexicon
    rows are pre-checked. Low-confidence / duplicate rows show greyed + badged.
  - **Page numbers required** — a row with no page/locator can't be saved
    (inline editable page field); home entries missing one get a "no page" badge.
  - Future uploads only contribute *new* terms — a row whose term is already in
    the lexicon is **hard-locked** (checkbox disabled, filtered from save;
    re-enables if the term is edited).
- **Added** — soft **delete** button on the home page (migration
  `gestalt_terms_add_deleted_at`; confirm dialog; sets `deleted_at`, recoverable).
- **Decided** — citation *attribution* (seminal author) is out of scope; nobody
  can verify it reliably. Registry is term + whatever citation the essay used.

### Known / outstanding

- Vercel project `gestalt-lexicon` is not yet linked to the GitHub repo — deploys
  are still manual CLI. Link via Vercel dashboard → Settings → Git.
- Supabase security advisor will re-flag `gestalt_terms` for permissive write
  policies — accepted, see ADR 0001.
- Possible future hardening: move `.txt` / paste parsing fully client-side so
  essay text never transits the server; soft-delete + curator review; write
  rate-limiting.
