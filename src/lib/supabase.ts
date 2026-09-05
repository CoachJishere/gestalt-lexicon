import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon);

export type GestaltTerm = {
  id: string;
  term: string;
  definition: string | null;
  author: string | null;
  year: number | null;
  article_title: string | null;
  source: string | null;
  page: string | null;
  url: string | null;
  contributed_by: string | null;
  created_at: string;
  updated_at: string;
};
