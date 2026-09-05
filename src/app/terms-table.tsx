"use client";

import { useMemo, useState } from "react";
import { supabase, type GestaltTerm } from "@/lib/supabase";
import { harvardCitation } from "@/lib/citation";
import { CONCEPT_SUGGESTIONS, isKnownConcept } from "@/lib/gestaltConcepts";

type FormState = {
  id?: string;
  term: string;
  author: string;
  year: string;
  article_title: string;
  source: string;
  page: string;
  url: string;
  contributed_by: string;
};

const emptyForm: FormState = {
  term: "",
  author: "",
  year: "",
  article_title: "",
  source: "",
  page: "",
  url: "",
  contributed_by: "",
};

export default function TermsTable({ initialTerms }: { initialTerms: GestaltTerm[] }) {
  const [terms, setTerms] = useState<GestaltTerm[]>(initialTerms);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter((t) => {
      return (
        t.term.toLowerCase().includes(q) ||
        (t.author ?? "").toLowerCase().includes(q) ||
        (t.article_title ?? "").toLowerCase().includes(q) ||
        (t.source ?? "").toLowerCase().includes(q)
      );
    });
  }, [terms, query]);

  async function handleSave() {
    setError(null);
    if (!form.term.trim()) {
      setError("Term is required.");
      return;
    }
    setSaving(true);
    const payload = {
      term: form.term.trim(),
      author: form.author.trim() || null,
      year: form.year ? parseInt(form.year, 10) : null,
      article_title: form.article_title.trim() || null,
      source: form.source.trim() || null,
      page: form.page.trim() || null,
      url: form.url.trim() || null,
      contributed_by: form.contributed_by.trim() || null,
    };
    if (form.id) {
      const { data, error } = await supabase
        .from("gestalt_terms")
        .update(payload)
        .eq("id", form.id)
        .select()
        .single();
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      setTerms((prev) =>
        prev.map((t) => (t.id === form.id ? (data as GestaltTerm) : t)).sort((a, b) => a.term.localeCompare(b.term))
      );
    } else {
      const { data, error } = await supabase.from("gestalt_terms").insert(payload).select().single();
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      setTerms((prev) => [...prev, data as GestaltTerm].sort((a, b) => a.term.localeCompare(b.term)));
    }
    setForm(emptyForm);
    setShowForm(false);
  }

  async function handleDelete(t: GestaltTerm) {
    if (!confirm(`Delete "${t.term}"? It will be removed from the lexicon.`)) return;
    const { error } = await supabase
      .from("gestalt_terms")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", t.id);
    if (error) {
      alert(`Couldn't delete: ${error.message}`);
      return;
    }
    setTerms((prev) => prev.filter((x) => x.id !== t.id));
  }

  function startEdit(t: GestaltTerm) {
    setForm({
      id: t.id,
      term: t.term,
      author: t.author ?? "",
      year: t.year?.toString() ?? "",
      article_title: t.article_title ?? "",
      source: t.source ?? "",
      page: t.page ?? "",
      url: t.url ?? "",
      contributed_by: t.contributed_by ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <datalist id="concept-suggestions">
        {CONCEPT_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search term, author, source..."
          className="flex-1 min-w-[240px] rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
        <button
          onClick={() => {
            setForm(emptyForm);
            setShowForm((s) => !s);
            setError(null);
          }}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {showForm ? "Cancel" : "Add term"}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <h2 className="mb-3 text-lg font-medium">{form.id ? "Edit term" : "Add a term"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Term *">
              <input
                value={form.term}
                list="concept-suggestions"
                onChange={(e) => setForm({ ...form, term: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Author (e.g. Kepner, J.)">
              <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Year">
              <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputCls} inputMode="numeric" />
            </Field>
            <Field label="Page(s)">
              <input value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Article / chapter title" full>
              <input value={form.article_title} onChange={(e) => setForm({ ...form, article_title: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Source (book or journal)" full>
              <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Link (DOI or URL)" full>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Your name (optional)">
              <input value={form.contributed_by} onChange={(e) => setForm({ ...form, contributed_by: e.target.value })} className={inputCls} />
            </Field>
          </div>
          {form.term && (
            <p className="mt-3 text-xs text-neutral-600">
              <span className="font-medium">Preview:</span> {harvardCitation(preview(form)) || "(fill more fields to preview citation)"}
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : form.id ? "Save changes" : "Add term"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
                setError(null);
              }}
              className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
            <tr>
              <th className="px-4 py-3 w-[18%]">Term</th>
              <th className="px-4 py-3 w-[22%]">Attributed to</th>
              <th className="px-4 py-3 w-[10%]">Page</th>
              <th className="px-4 py-3 w-[40%]">Full citation (Harvard)</th>
              <th className="px-4 py-3 w-[10%]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                  No terms match your search.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.term}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                      {!isKnownConcept(t.term) && (
                        <span className="rounded bg-amber-100 px-1 text-amber-800">new term</span>
                      )}
                      {!t.page && (
                        <span className="rounded bg-amber-100 px-1 text-amber-800">no page</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.author ?? "—"}
                    {t.year ? ` (${t.year})` : ""}
                  </td>
                  <td className="px-4 py-3">{t.page ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div>{harvardCitation(t) || "—"}</div>
                    {t.url && (
                      <a href={t.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-blue-600 underline">
                        link
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(t)} className="text-xs text-neutral-600 underline hover:text-neutral-900">
                      edit
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="ml-3 text-xs text-red-600 underline hover:text-red-800"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-neutral-500">{filtered.length} term{filtered.length === 1 ? "" : "s"}</p>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none";

function preview(f: FormState) {
  return {
    author: f.author || null,
    year: f.year ? parseInt(f.year, 10) : null,
    article_title: f.article_title || null,
    source: f.source || null,
    page: f.page || null,
  };
}
