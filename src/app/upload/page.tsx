"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { harvardCitation } from "@/lib/citation";
import type { ExtractedCitation } from "@/lib/parseCitations";

type Row = ExtractedCitation & {
  include: boolean;
  saved: boolean;
};

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
      setRows(cits.map((c) => ({ ...c, include: true, saved: false })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse");
    }
    setLoading(false);
  }

  async function handleSaveAll() {
    setSaveResult(null);
    setSavingAll(true);
    const toSave = rows
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.include && !r.saved && r.term.trim());

    if (toSave.length === 0) {
      setSaveResult("Nothing to save. Make sure each included row has a term.");
      setSavingAll(false);
      return;
    }

    const payload = toSave.map(({ r }) => ({
      term: r.term.trim(),
      author: r.author || null,
      year: r.year || null,
      page: r.page,
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
    setRows((prev) =>
      prev.map((r, idx) => {
        const wasSaved = toSave.find((t) => t.idx === idx);
        return wasSaved ? { ...r, saved: true } : r;
      })
    );
    setSaveResult(`Added ${savedCount} term${savedCount === 1 ? "" : "s"} to the lexicon.`);
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
        <div className="mb-3 flex gap-2 text-sm">
          <button
            onClick={() => setTab("file")}
            className={`rounded px-3 py-1.5 ${tab === "file" ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}
          >
            Upload file
          </button>
          <button
            onClick={() => setTab("paste")}
            className={`rounded px-3 py-1.5 ${tab === "paste" ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}
          >
            Paste text
          </button>
        </div>

        {tab === "file" ? (
          <>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <p className="mt-2 text-xs text-neutral-500">
              .pdf, .docx, .txt — make sure the file contains the References section.
            </p>
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
          <div className="mb-3 rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
            <p className="mb-1 font-medium">Please review each row before saving:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>
                <span className="font-medium">The &ldquo;term&rdquo; column is a guess</span> — it grabs the 1–3 words just
                before the citation, which is often right (e.g. &ldquo;awareness&rdquo;) but sometimes grabs filler words.
                Fix any that look wrong.
              </li>
              <li>
                <span className="font-medium">Amber-flagged rows have no matching reference.</span> The article title
                and source will be blank. Either skip them, or save and fill in the details on the main page afterwards.
              </li>
              <li>
                <span className="font-medium">Uncheck anything you don&apos;t want saved</span> — duplicates, off-topic
                citations, references to methods rather than concepts, etc.
              </li>
            </ul>
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Term (editable)</th>
                  <th className="px-3 py-2">Author / Year / Page</th>
                  <th className="px-3 py-2">Full citation</th>
                  <th className="px-3 py-2">Context</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className={`border-t border-neutral-100 align-top ${r.saved ? "opacity-50" : ""}`}>
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
                        disabled={r.saved}
                        onChange={(e) => updateRow(idx, { term: e.target.value })}
                        placeholder="(enter term)"
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div>{r.author}</div>
                      <div className="text-xs text-neutral-600">
                        {r.year}
                        {r.page ? `, p. ${r.page}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{harvardCitation(r) || <span className="text-neutral-400">—</span>}</div>
                      {!r.matchedReference && (
                        <div className="mt-1 text-xs text-amber-700">No matching entry in References section</div>
                      )}
                      {r.saved && <div className="mt-1 text-xs text-green-700">Saved ✓</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">
                      ...{r.contextBefore.trim()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
