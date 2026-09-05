import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls in pdfjs-dist, which resolves its worker (.mjs) relative to
  // its own package dir at runtime. Bundling breaks that path ("Cannot find
  // module pdf.worker.mjs"), so load it via native require instead.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
