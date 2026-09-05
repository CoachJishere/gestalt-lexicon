# Gestalt Lexicon

A crowd-contributed, human-curated registry of Gestalt therapy terms with
verified Harvard-style citations, for incoming students.

**Why:** students had been using general-purpose AI to find citations for Gestalt
concepts; the AI hallucinated wrong or nonexistent sources and they lost marks.
This registry is built from essays that have already been graded, with citations
checked by a human. See [docs/PROJECT.md](docs/PROJECT.md).

## How it works

- **Browse / search** terms and their full Harvard citations on the home page.
- **Add a term** directly, or **upload an essay** at `/upload` to extract its
  citations. The essay (file or pasted text) is parsed **in memory and never
  stored** — only the citation metadata you choose to save is written.
- Extraction is **regex / heuristic, no AI** ([src/lib/parseCitations.ts](src/lib/parseCitations.ts)),
  so it cannot hallucinate. It can miss or mis-guess, so you review every row
  before saving.
- Anyone can add or edit entries. No login. Deletes are disabled (correct a bad
  entry by editing it).

## Stack

- Next.js 16 (App Router, Turbopack)
- Supabase (`gestalt_terms` table — see [docs/adr/0001](docs/adr/0001-open-writes-in-shared-database.md))
- Deployed on Vercel: <https://gestalt-lexicon.vercel.app>

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

Requires `.env.local` (not committed):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

See [CHANGELOG.md](CHANGELOG.md) for history.
