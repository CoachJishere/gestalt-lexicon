import type { GestaltTerm } from "./supabase";

// Harvard-style citation: Author (Year) 'Article title', Source, p. Page.
export function harvardCitation(t: Pick<GestaltTerm, "author" | "year" | "article_title" | "source" | "page">): string {
  const parts: string[] = [];
  if (t.author) parts.push(t.author);
  if (t.year) parts.push(`(${t.year})`);
  let head = parts.join(" ");
  if (t.article_title) head += head ? ` '${t.article_title}'` : `'${t.article_title}'`;
  const tail: string[] = [];
  if (t.source) tail.push(t.source);
  // Numeric pages get a "p." prefix; ebook locators ("ch. 5, para. 62") are kept as-is.
  if (t.page) tail.push(/^\d/.test(String(t.page)) ? `p. ${t.page}` : String(t.page));
  const tailStr = tail.join(", ");
  const joined = [head, tailStr].filter(Boolean).join(", ");
  return joined ? joined + "." : "";
}
