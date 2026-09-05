import { NextResponse } from "next/server";
import { extractCitations } from "@/lib/parseCitations";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let text = "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      text = typeof body.text === "string" ? body.text : "";
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      const name = file.name.toLowerCase();
      const buf = Buffer.from(await file.arrayBuffer());

      if (name.endsWith(".txt") || name.endsWith(".md")) {
        text = buf.toString("utf8");
      } else if (name.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer: buf });
        text = result.value;
      } else if (name.endsWith(".pdf")) {
        // unpdf ships a serverless build of pdf.js — no DOM globals, no worker.
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const result = await extractText(pdf, { mergePages: true });
        text = result.text;
      } else {
        return NextResponse.json({ error: "Unsupported file type. Use .pdf, .docx, or .txt" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Empty document" }, { status: 400 });
    }

    const citations = extractCitations(text);
    return NextResponse.json({ citations, textLength: text.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
