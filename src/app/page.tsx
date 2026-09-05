import { supabase, type GestaltTerm } from "@/lib/supabase";
import TermsTable from "./terms-table";

export const revalidate = 0;

export default async function Home() {
  const { data, error } = await supabase
    .from("gestalt_terms")
    .select("*")
    .order("term", { ascending: true });

  const terms: GestaltTerm[] = (data ?? []) as GestaltTerm[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Gestalt Lexicon</h1>
            <p className="mt-2 text-sm text-neutral-600">
              A shared reference of Gestalt therapy terms with Harvard-style citations.
              Anyone can add or edit entries.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Contribute citations from your own graded essay — the essay itself is never uploaded or stored,
              only the citation details you choose to add.
            </p>
          </div>
          <a
            href="/upload"
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
          >
            Upload essay →
          </a>
        </div>
        {error ? (
          <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
            Error loading terms: {error.message}
          </p>
        ) : null}
      </header>
      <TermsTable initialTerms={terms} />
    </main>
  );
}
