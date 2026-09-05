"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { harvardCitation } from "@/lib/citation";
import type { ExtractedCitation } from "@/lib/parseCitations";
import { CONCEPT_SUGGESTIONS, isKnownConcept, sameTerm } from "@/lib/gestaltConcepts";

type Row = ExtractedCitation & {
  include: boolean;
  saved: boolean;
  exists: boolean; // term already in the lexicon
};

const hasPage = (r: { page: string | null }) => !!r.page && r.page.trim().length > 0;

export default function UploadPage() {
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [contributor, setContributor] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [existingTerms, setExistingTerms] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Terms already in the lexicon — future uploads only need to add *new* ones.
  useEffect(() => {
    supabase
      .from("gestalt_terms")
      .select("term")
      .is("deleted_at", null)
      .then(({ data }) => setExistingTerms((data ?? []).map((r) => r.term as string)));
  }, []);

  const alreadyInLexicon = (term: string) =>
    !!term && existingTerms.some((t) => sameTerm(t, term));

  const ACCEPT_RE = /\.(pdf|docx|txt|md)$/i;
  function acceptFile(f: File | undefined | null) {
    if (!f) return;
    if (!ACCEPT_RE.test(f.name)) {
      setError("Use a .pdf, .docx or .txt file.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function handleParse() {
    setError(null);
    setRows([]);
    setSaveResult(null);
    setLoading(true);
    try {
      let res: Response;
      if (tab === "file") {
        if (!file) {
          setError("Choose a file first.");
          setLoading(false);
          return;
        }
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/parse-essay", { method: "POST", body: form });
      } else {
        if (!pasteText.trim()) {
          setError("Paste some text first.");
          setLoading(false);
          return;
        }
        res = await fetch("/api/parse-essay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: pasteText }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to parse");
        setLoading(false);
        return;
      }
      const cits: ExtractedCitation[] = data.citations ?? [];
      if (cits.length === 0) {
        setError("No citations found. Make sure the essay uses Harvard-style (Author, Year) citations.");
      }
      setRows(
        cits.map((c) => {
          const exists = alreadyInLexicon(c.term);
          return {
            ...c,
            saved: false,
            exists,
            // Pre-check only confident, page-bearing, not-already-present rows.
            include: c.confidence === "high" && hasPage(c) && !exists,
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse");
    }
    setLoading(false);
  }

  async function handleSaveAll() {
    setSaveResult(null);
    setSavingAll(true);
    const checked = rows
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.include && !r.saved && r.term.trim());

    const missingPage = checked.filter(({ r }) => !hasPage(r));
    const toSave = checked.filter(({ r }) => hasPage(r));

    if (toSave.length === 0) {
      setSaveResult(
        missingPage.length > 0
          ? `Nothing saved — ${missingPage.length} checked row${missingPage.length === 1 ? "" : "s"} still need${missingPage.length === 1 ? "s" : ""} a page number.`
          : "Nothing to save. Check at least one row and give it a term."
      );
      setSavingAll(false);
      return;
    }

    const payload = toSave.map(({ r }) => ({
      term: r.term.trim(),
      author: r.author || null,
      year: r.year || null,
      page: r.page ? r.page.trim() : null,
      article_title: r.article_title,
      source: r.source,
      contributed_by: contributor.trim() || null,
    }));

    const { data, error } = await supabase.from("gestalt_terms").insert(payload).select();
    setSavingAll(false);
    if (error) {
      setSaveResult(`Error: ${error.message}`);
      return;
    }
    const savedCount = data?.length ?? 0;
    const savedIdx = new Set(toSave.map((t) => t.idx));
    setRows((prev) => prev.map((r, idx) => (savedIdx.has(idx) ? { ...r, saved: true } : r)));
    setExistingTerms((prev) => [...prev, ...payload.map((p) => p.term)]);
    const tail =
      missingPage.length > 0
        ? ` ${missingPage.length} row${missingPage.length === 1 ? "" : "s"} skipped — no page number.`
        : "";
    setSaveResult(`Added ${savedCount} term${savedCount === 1 ? "" : "s"} to the lexicon.${tail}`);
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm text-neutral-600 underline hover:text-neutral-900">
          ← Back to lexicon
        </Link>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Upload essay to extract citations</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Upload a .pdf / .docx / .txt file, or paste essay text. The parser looks for Harvard-style in-text citations
        like <code className="rounded bg-neutral-100 px-1">(Parlett, 1991, p. 70)</code> and matches them against the
        essay&apos;s References section.
      </p>

      <details className="group mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
          <span aria-hidden="true">🔒</span>
          Your essay is never stored — learn more about how we use your data
          <span aria-hidden="true" className="ml-auto text-emerald-700 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 space-y-3">
          <p>
            This tool exists so you can contribute the citations from your essay <span className="font-medium">without
            handing over the essay itself</span>. Graded essays are confidential and stay that way.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-emerald-200 bg-white/60 p-3">
              <p className="mb-1 font-medium text-emerald-800">✓ Saved to the shared lexicon</p>
              <p>
                Only the citation details you choose to add: term, author, year, page, article / chapter title, source,
                and the name you optionally type. These are public bibliographic facts.
              </p>
            </div>
            <div className="rounded border border-emerald-200 bg-white/60 p-3">
              <p className="mb-1 font-medium text-emerald-800">✗ Never saved anywhere</p>
              <p>
                Your essay. The file (or pasted text) is read once in memory to pull out citations, then discarded —
                it is not written to a database, saved to disk, or logged. The surrounding sentences shown next to each
                citation are for your review only and are never saved.
              </p>
            </div>
          </div>
          <p className="text-xs text-emerald-800">
            The essay text is sent to our server for that one parsing step and immediately dropped. Nothing about its
            content is kept, and nothing is saved until you review the results and click to add.
          </p>
        </div>
      </details>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="mb-2 font-medium">Before you upload — read this:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <span className="font-medium">Include the References / Bibliography section</span> at the end of the essay.
            Without it, only author / year / page will be filled in — not the article title or source.
          </li>
          <li>
            <span className="font-medium">.docx is most reliable.</span> PDFs exported from Word / Pages / LaTeX work
            well; scanned PDFs and two-column journal PDFs often produce garbled text. If results look wrong, re-save
            the file as .docx and try again.
          </li>
          <li>
            Only <span className="font-medium">Harvard-style</span> citations are detected — parenthetical
            <span className="italic"> (Author, Year, p. X)</span>. Footnote or numbered styles won&apos;t work.
          </li>
          <li>
            You&apos;ll review every citation before anything is saved — nothing goes into the shared lexicon until you
            click the add button.
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-xs text-neutral-500">Give us the essay:</span>
          <div className="inline-flex rounded-md border border-neutral-300 p-0.5">
            <button
              onClick={() => setTab("file")}
              className={`rounded px-3 py-1 ${tab === "file" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              Upload a file
            </button>
            <button
              onClick={() => setTab("paste")}
              className={`rounded px-3 py-1 ${tab === "paste" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              Paste text
            </button>
          </div>
        </div>

        {tab === "file" ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => acceptFile(e.target.files?.[0])}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
                dragActive
                  ? "border-neutral-900 bg-neutral-50"
                  : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
              }`}
            >
              {file ? (
                <>
                  <span className="font-medium text-neutral-900">{file.name}</span>
                  <span className="text-xs text-neutral-500">click to choose a different file</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-neutral-900">Choose a file or drop it here</span>
                  <span className="text-xs text-neutral-500">.pdf, .docx or .txt — must include the References section</span>
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              placeholder="Paste the full essay here — include the References / Bibliography section at the end."
              className="w-full rounded border border-neutral-300 p-3 text-sm"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Paste the whole thing, including the References section. The heading should be on its own line.
            </p>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={handleParse}
            disabled={loading}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {loading ? "Parsing..." : "Extract citations"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-medium">
              Found {rows.length} citation{rows.length === 1 ? "" : "s"}
            </h2>
            <div className="flex items-center gap-3">
              <input
                value={contributor}
                onChange={(e) => setContributor(e.target.value)}
                placeholder="Your name (optional)"
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <button
                onClick={handleSaveAll}
                disabled={savingAll}
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {savingAll ? "Saving..." : "Add checked to lexicon"}
              </button>
            </div>
          </div>
          {saveResult && <p className="mb-3 text-sm text-neutral-700">{saveResult}</p>}
          {(() => {
            const live = rows.filter((r) => !r.saved);
            const dupes = live.filter((r) => r.exists).length;
            const low = live.filter((r) => !r.exists && r.confidence === "low").length;
            const noPage = live.filter((r) => r.include && !hasPage(r)).length;
            return (
              <p className="mb-2 text-xs text-neutral-600">
                {live.filter((r) => r.include).length} checked to add
                {dupes > 0 && <> · {dupes} already in the lexicon (skipped)</>}
                {low > 0 && <> · {low} low-confidence (unchecked)</>}
                {noPage > 0 && <> · <span className="text-amber-700">{noPage} need a page number</span></>}
              </p>
            );
          })()}
          <div className="mb-3 rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
            <p className="mb-1 font-medium">How to read this:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>
                <span className="font-medium">Only confident rows are pre-checked.</span> Greyed rows are
                low-confidence (the term guess is weak, or it looks like a claim rather than a concept) or already in
                the lexicon — check one deliberately if it belongs.
              </li>
              <li>
                <span className="font-medium">The term is a guess.</span> Click a candidate chip or type your own.
                A <span className="rounded bg-amber-100 px-1">new term</span> badge means it&apos;s not on the known
                Gestalt-concept list — double-check it&apos;s a real concept.
              </li>
              <li>
                <span className="font-medium">Every citation needs a page number</span> (or an ebook chapter/paragraph).
                Rows without one can&apos;t be saved — add it from the essay.
              </li>
            </ul>
          </div>
          <datalist id="concept-suggestions">
            {CONCEPT_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 w-[28%]">Term — pick or edit</th>
                  <th className="px-3 py-2">Author / Year / Page</th>
                  <th className="px-3 py-2">Full citation</th>
                  <th className="px-3 py-2">Context</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const dim = !r.saved && (r.exists || r.confidence === "low");
                  const newTerm = !!r.term.trim() && !isKnownConcept(r.term);
                  const pageMissing = r.include && !hasPage(r);
                  return (
                    <tr
                      key={idx}
                      className={`border-t border-neutral-100 align-top ${r.saved ? "opacity-50" : dim ? "bg-neutral-50/70 text-neutral-500" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={r.saved}
                          onChange={(e) => updateRow(idx, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.term}
                          list="concept-suggestions"
                          disabled={r.saved}
                          onChange={(e) => updateRow(idx, { term: e.target.value })}
                          placeholder="enter the term"
                          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
                        />
                        {!r.saved && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {r.termCandidates.map((cand) => {
                              const active = r.term.trim().toLowerCase() === cand.toLowerCase();
                              return (
                                <button
                                  key={cand}
                                  type="button"
                                  onClick={() => updateRow(idx, { term: cand })}
                                  className={`rounded-full border px-2 py-0.5 text-xs ${
                                    active
                                      ? "border-neutral-900 bg-neutral-900 text-white"
                                      : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                                  }`}
                                >
                                  {cand}
                                </button>
                              );
                            })}
                            {r.termCandidates.length === 0 && (
                              <span className="text-xs text-neutral-400">no guess — type the term</span>
                            )}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                          {r.exists && (
                            <span className="rounded bg-neutral-200 px-1 text-neutral-600">already in lexicon</span>
                          )}
                          {!r.exists && r.confidence === "low" && (
                            <span className="rounded bg-neutral-200 px-1 text-neutral-600">low confidence</span>
                          )}
                          {!r.exists && newTerm && (
                            <span className="rounded bg-amber-100 px-1 text-amber-800">new term</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-neutral-900">{r.author}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs">
                          <span className="text-neutral-600">{r.year}</span>
                          <input
                            value={r.page ?? ""}
                            disabled={r.saved}
                            onChange={(e) => updateRow(idx, { page: e.target.value || null })}
                            placeholder="page *"
                            className={`w-24 rounded border px-1.5 py-0.5 text-xs ${
                              pageMissing ? "border-amber-400 bg-amber-50" : "border-neutral-300"
                            }`}
                          />
                        </div>
                        {pageMissing && (
                          <div className="mt-1 text-[11px] text-amber-700">page number required to save</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-neutral-900">
                          {harvardCitation(r) || <span className="text-neutral-400">—</span>}
                        </div>
                        {!r.matchedReference && (
                          <div className="mt-1 text-xs text-amber-700">No matching entry in References section</div>
                        )}
                        {r.saved && <div className="mt-1 text-xs text-green-700">Saved ✓</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500">...{r.contextBefore.trim()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
