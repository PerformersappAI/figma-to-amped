import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

const TEXT_EXT = ["html", "htm", "css", "js", "svg", "txt", "json", "md"];
const ASSET_EXT = ["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "woff", "woff2", "ttf", "otf", "eot", "mp4", "webm", "mp3"];

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export type ImportResult = {
  html: string;
  css: string;
  zipPath: string;
};

export async function importZip(
  file: File,
  userId: string,
  projectId: string,
  onProgress?: (pct: number, label: string) => void,
): Promise<ImportResult> {
  onProgress?.(5, "Reading ZIP…");
  const zip = await JSZip.loadAsync(file);

  // Upload original ZIP
  onProgress?.(15, "Saving original…");
  const zipPath = `${userId}/${projectId}/original.zip`;
  await supabase.storage.from("project-zips").upload(zipPath, file, { upsert: true });

  // Find all files
  const entries: { path: string; file: JSZip.JSZipObject }[] = [];
  zip.forEach((rel, f) => { if (!f.dir) entries.push({ path: rel, file: f }); });

  // Find best HTML file (prefer index.html, else largest .html)
  const htmlFiles = entries.filter(e => ["html", "htm"].includes(ext(e.path)));
  const indexFile =
    htmlFiles.find(f => f.path.toLowerCase().endsWith("index.html")) ||
    htmlFiles.sort((a, b) => (b.file as any)._data.uncompressedSize - (a.file as any)._data.uncompressedSize)[0];

  if (!indexFile) throw new Error("No HTML file found inside the ZIP.");

  const htmlBaseDir = indexFile.path.includes("/") ? indexFile.path.replace(/\/[^/]+$/, "/") : "";

  // Upload all assets to project-assets and build URL map
  onProgress?.(35, "Uploading assets…");
  const urlMap: Record<string, string> = {};
  const assetEntries = entries.filter(e => ASSET_EXT.includes(ext(e.path)));
  let i = 0;
  for (const a of assetEntries) {
    const blob = await a.file.async("blob");
    const safeName = a.path.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const dest = `${userId}/${projectId}/${safeName}`;
    const { error } = await supabase.storage
      .from("project-assets")
      .upload(dest, blob, { upsert: true, contentType: guessMime(a.path) });
    if (!error) {
      const { data } = supabase.storage.from("project-assets").getPublicUrl(dest);
      urlMap[a.path] = data.publicUrl;
      // Also map the relative path from index file's perspective
      if (htmlBaseDir && a.path.startsWith(htmlBaseDir)) {
        urlMap[a.path.slice(htmlBaseDir.length)] = data.publicUrl;
      }
      const baseName = a.path.split("/").pop()!;
      urlMap[baseName] = data.publicUrl;
    }
    i++;
    onProgress?.(35 + Math.floor((i / Math.max(assetEntries.length, 1)) * 35), "Uploading assets…");
  }

  // Read HTML
  onProgress?.(75, "Parsing HTML…");
  let html = await indexFile.file.async("string");

  // Inline referenced CSS
  let cssAccum = "";
  const cssLinks = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi)];
  for (const m of cssLinks) {
    const href = m[1];
    const target = entries.find(e => e.path === href || e.path.endsWith("/" + href) || e.path === htmlBaseDir + href);
    if (target) {
      const cssText = await target.file.async("string");
      cssAccum += `\n/* ${href} */\n${cssText}`;
      html = html.replace(m[0], "");
    }
  }

  // Extract <style> blocks
  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  for (const s of styleBlocks) cssAccum += `\n${s[1]}`;

  // Rewrite asset URLs in HTML and CSS
  html = rewriteUrls(html, urlMap);
  cssAccum = rewriteUrls(cssAccum, urlMap);

  // Extract body content for GrapesJS-friendly HTML
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const finalHtml = bodyMatch ? bodyMatch[1] : html;

  onProgress?.(100, "Done");
  return { html: finalHtml, css: cssAccum, zipPath };
}

function rewriteUrls(text: string, map: Record<string, string>): string {
  return text.replace(/(["'(])([^"')\s]+\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3))/gi, (full, q, path) => {
    if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("//")) return full;
    const clean = path.replace(/^\.\//, "").replace(/^\//, "");
    const hit = map[path] || map[clean] || map[clean.split("/").pop()!];
    return hit ? q + hit : full;
  });
}

function guessMime(path: string) {
  const e = ext(path);
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
  };
  return map[e] || "application/octet-stream";
}
