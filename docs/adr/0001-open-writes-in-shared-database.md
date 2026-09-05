# ADR 0001 — Open, unauthenticated writes; stay in the shared Supabase DB

- **Status:** accepted — migration `gestalt_terms_reopen_public_insert_update`
  applied to `mhfikaomkmqcndqfohbp` on 2026-09-05. Verified: anon INSERT (201)
  and UPDATE (204) succeed; anon DELETE removes 0 rows (RLS blocks it).
- **Date:** 2026-09-05
- **Deciders:** Jonathan Miller (with the client)

## Context

`gestalt-lexicon` is a crowd-contributed, human-curated registry of Gestalt
therapy terms and their verified Harvard citations (see `docs/PROJECT.md`).

Key facts that shape this decision:

- **Contributors are students, not one curator.** Students have their own
  essays — already graded, citations already checked by markers — and want to
  contribute those citations. It must *not* be a single client uploading, because
  the essays are **confidential** and students won't hand them over.
- **The essay is never stored.** `/api/parse-essay` extracts text in memory,
  runs the regex parser, returns only citation metadata + a character count. The
  saved record contains only bibliographic fields (term, author, year, page,
  article title, source, contributor name). No essay text, no surrounding
  context, nothing to disk or DB.
- The `gestalt_terms` table currently lives in the Supabase project
  **"Murder Mystery Party Generator"** (`mhfikaomkmqcndqfohbp`). A security-lint
  migration (`20260515153947 security_lint_gestalt_terms_lock_writes`) dropped
  its public write policies, so today all client writes fail with RLS error
  `42501`. Add / edit / upload-save are all broken.
- A dedicated Supabase project costs **$10/mo** in the current Pro org. A
  separate free org is $0 but auto-pauses after 7 days idle.

## Decision

1. **Keep the table in the shared "Murder Mystery Party Generator" database.**
   Not worth $10/mo or the pause hassle of a free org for one small table.
2. **Re-open public, unauthenticated `INSERT` and `UPDATE`** on `gestalt_terms`
   via RLS policies for `anon` + `authenticated`. This matches the contribution
   model — anyone can add or correct an entry, no login.
3. **Do not grant public `DELETE`.** Anonymous hard-deletes are the highest-risk,
   lowest-value operation for a curated registry. Wrong entries get *corrected*
   (update), not deleted. Row removal / de-duplication becomes a curator task
   (future: a lightweight admin path). The per-row delete button is removed from
   the UI for now.
4. **No service-role key in this app.** That key bypasses RLS on the *entire*
   shared business database (orders, conversations, payment columns…). Putting it
   in a separate public app is an unacceptable blast radius. Writes go directly
   from the browser with the public anon key, governed by the table's own RLS.

## Consequences

- Add / edit / upload-save work again once the migration is applied.
- `get_advisors` (security) will re-flag `gestalt_terms` as having permissive
  write policies. This is an **accepted, documented risk** — it is isolated
  reference data with no FKs and no sensitive columns, and RLS is per-table so
  no other table is affected.
- Vandalism / spam / bad entries are possible. Accepted for now. Future
  mitigations if it becomes a problem, in rough order: soft-delete + curator
  review, per-IP rate limiting on writes, a submission/approval queue.
- The confidentiality guarantee (essay never persisted) should be stated in the
  `/upload` UI so contributors trust it. A future hardening step is to move the
  `.txt` / paste parsing fully client-side so the text never leaves the browser.

## Migration to apply

```sql
-- Re-open public write access to gestalt_terms (crowd-contributed citation
-- registry). Isolated reference table, no FKs, no sensitive columns; RLS is
-- per-table so no other table in this shared DB is affected.
-- Partially reverts: 20260515153947 security_lint_gestalt_terms_lock_writes
-- Intentionally does NOT restore public DELETE.

CREATE POLICY "public insert gestalt_terms" ON public.gestalt_terms
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "public update gestalt_terms" ON public.gestalt_terms
  FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT INSERT, UPDATE ON public.gestalt_terms TO anon, authenticated;
```
