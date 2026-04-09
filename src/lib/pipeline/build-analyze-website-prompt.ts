import type { PipelineState, WebsiteResult } from "./types";

/** Keep user message within practical context limits; remainder is summarized as truncated. */
const MAX_MARKDOWN_CHARS = 100_000;

function formatScrapeStats(website: WebsiteResult): string {
  const s = website.scrape;
  const lines: string[] = [
    `Canonical URL scraped: ${website.url}`,
    `Content source: ${s?.source ?? "unknown"}`,
  ];
  if (s?.totalMs != null) {
    lines.push(`Total step time (reported): ${s.totalMs} ms`);
  }
  if (s?.firecrawlMs != null) {
    lines.push(`Firecrawl time: ${s.firecrawlMs} ms`);
  }
  if (s?.fetchMs != null) {
    lines.push(`Plain HTTP fetch time: ${s.fetchMs} ms`);
  }
  if (s?.httpStatus != null) {
    lines.push(`HTTP status (when fetch used): ${s.httpStatus}`);
  }
  if (s?.note?.trim()) {
    lines.push(`Notes: ${s.note.trim()}`);
  }
  if (!s) {
    lines.push("No scrape timing metadata was recorded.");
  }
  return lines.join("\n");
}

/**
 * User message for Claude: scrape stats + markdown + evaluation rubric.
 */
export function buildAnalyzeWebsitePrompt(state: PipelineState): string {
  const website = state.website;
  if (!website?.markdown?.trim()) {
    throw new Error("buildAnalyzeWebsitePrompt requires state.website with markdown");
  }

  const practice =
    state.input.practiceName?.trim() ||
    state.resolve?.name?.trim() ||
    "Unknown practice";

  let md = website.markdown;
  let truncatedNote = "";
  if (md.length > MAX_MARKDOWN_CHARS) {
    truncatedNote = `\n\n_[Markdown truncated: ${md.length} characters total; showing first ${MAX_MARKDOWN_CHARS}._]\n`;
    md = md.slice(0, MAX_MARKDOWN_CHARS);
  }

  const statsBlock = formatScrapeStats(website);

  return [
    `You are reviewing the public website for a medical practice as part of a visibility audit.`,
    ``,
    `**Practice:** ${practice}`,
    ``,
    `---`,
    ``,
    `## Scrape statistics`,
    ``,
    statsBlock,
    ``,
    `---`,
    ``,
    `## Page content (Markdown from scrape)`,
    ``,
    md,
    truncatedNote,
    ``,
    `---`,
    ``,
    `## Your task`,
    ``,
    `Based **only** on the markdown and metadata above, produce a structured analysis. If evidence is missing for an item, say **Cannot determine from scrape** and briefly why.`,
    ``,
    `Use clear headings. Be direct and specific; cite what you see in the content (quotes or page titles) when helpful.`,
    ``,
    `**Evaluate:**`,
    ``,
    `- **Platform** — e.g. Squarespace, WordPress, Wix, Officite, Webflow, Duda, custom stack, or unknown (name signals you see: generator meta, paths, scripts, footer credits).`,
    `- **Mobile responsiveness** — viewport hints, responsive patterns, or state if not inferable.`,
    `- **SSL certificate** — HTTPS usage for the scraped URL; certificate details only if present in content; otherwise note what can be inferred from URL scheme.`,
    `- **Online scheduling method** — native widget, Zocdoc (or similar), simple contact form only, phone-only, none visible, etc.`,
    `- **Contact info visibility** — phone, email, address, hours; how easy to find.`,
    `- **Service / condition pages** — approximate count and whether they look deep (dedicated pages vs. one long list).`,
    `- **Blog posts** — approximate count if visible, recency signals, whether content looks original vs syndicated/generic.`,
    `- **Doctor bios** — present/absent, quality signals, multiple providers.`,
    `- **Professional design quality** — layout, typography, imagery, trust signals (subjective but grounded in evidence).`,
    `- **Platform control** — vendor-locked / templated vs signs of self-hosted or custom control (best effort from content).`,
    ``,
    `End with a short **Bottom line** (3–5 sentences) for the practice owner.`,
  ].join("\n");
}

export const ANALYZE_WEBSITE_SYSTEM_PROMPT =
  "You audit healthcare practice websites for marketing and compliance-style reviews. Answer in plain text with headings; no markdown code fences unless showing short examples.";
