# Gestalt Lexicon — project context

## Purpose

A **human-curated registry** of Gestalt therapy terms with **verified, correctly
formatted citations** (Harvard style), for incoming students to reference when
writing essays.

## Why it exists

The client's students had been using general-purpose AI to find citations for
Gestalt concepts. The AI **hallucinated citations** — wrong authors, wrong years,
sources that don't exist — and students **lost marks** for citing them.

This project is the antidote: a registry built from **essays that have already
been properly graded and whose citations have been checked by a human**. Every
entry is human-verified. Accuracy is the entire point — a wrong citation here is
worse than a missing one.

## How it works

1. A curator uploads a graded essay (or pastes its text) at `/upload`.
2. A **regex/heuristic parser** (`src/lib/parseCitations.ts`) extracts Harvard
   in-text citations and matches them against the essay's References section.
   **No AI** — deterministic pattern matching, so it cannot hallucinate. It can
   miss or mis-guess, which is why step 3 exists.
3. The curator **reviews every extracted row** — fixes the guessed term, drops
   junk, confirms author/year/source — before anything is saved.
4. Verified terms land in the `gestalt_terms` table and show on the home page,
   searchable, each with its full Harvard citation.

## Key design constraints

- **The parser is a drafting aid, not an authority.** Human review before save is
  non-negotiable.
- **No paid AI APIs.** Extraction is regex-only by design (cost, and more
  importantly: determinism / no hallucination).
- Citations must render in correct **Harvard** format (`src/lib/citation.ts`).

## Infrastructure (as of 2026-09-05)

- **Next.js 16** app, deployed on Vercel: <https://gestalt-lexicon.vercel.app>
- **GitHub:** <https://github.com/CoachJishere/gestalt-lexicon> (public)
- **Database:** the `gestalt_terms` table lives inside the Supabase project named
  **"Murder Mystery Party Generator"** (ref `mhfikaomkmqcndqfohbp`, org
  "CoachJ's Org"). It is a lodger in that shared production DB, not its own
  project — see `docs/adr/` for the write-access decision.
