import type { LocalFalconLocationRow } from "@/lib/localfalcon/types";
import type { RetrievedScanReport } from "./types";

const MAX_JSON_CHARS = 48_000;

/**
 * Pull fields from a Local Falcon scan report payload that typically reflect GBP / listing data.
 */
export function slicePayloadForGbp(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (payload.location && typeof payload.location === "object") {
    out.location = payload.location;
  }
  for (const key of Object.keys(payload)) {
    const lower = key.toLowerCase();
    if (
      lower === "location" && out.location !== undefined
    ) {
      continue;
    }
    if (
      lower.includes("hour") ||
      lower.includes("holiday") ||
      lower.includes("post") ||
      lower.includes("review") ||
      lower.includes("photo") ||
      lower.includes("question") ||
      lower.includes("qa") ||
      lower.includes("categor") ||
      lower.includes("service") ||
      lower.includes("product") ||
      lower.includes("attribute") ||
      lower.includes("description") ||
      lower.includes("title") ||
      lower === "place_id" ||
      lower === "platform"
    ) {
      out[key] = payload[key];
    }
  }
  return out;
}

export function sliceSavedLocationRow(row: LocalFalconLocationRow): Record<string, unknown> {
  return {
    id: row.id,
    platform: row.platform,
    place_id: row.place_id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    rating: row.rating,
    reviews: row.reviews,
    url: row.url,
    phone: row.phone,
    categories: row.categories,
    groups: row.groups,
    store_code: row.store_code,
  };
}

export function buildReportGbpSlices(
  reports: RetrievedScanReport[],
): Array<{ keyword: string; data: Record<string, unknown> }> {
  return reports.map((r) => ({
    keyword: r.keyword,
    data: slicePayloadForGbp(r.payload),
  }));
}

export type AnalyzeGbpPromptInput = {
  practiceName: string;
  placeId: string;
  formattedAddress: string;
  resolveRating?: number;
  resolveReviewCount?: number;
  savedLocation: Record<string, unknown> | null;
  reportSlices: Array<{ keyword: string; data: Record<string, unknown> }>;
  listLocationsError?: string;
};

function jsonBlock(label: string, value: unknown): string {
  try {
    const s = JSON.stringify(value, null, 2);
    return `${label}\n\`\`\`json\n${s}\n\`\`\``;
  } catch {
    return `${label}\n_(unserializable)_`;
  }
}

/**
 * User message: Local Falcon–grounded GBP assessment (see SKILL.md — Assess the Google Business Profile).
 */
export function buildAnalyzeGbpPrompt(input: AnalyzeGbpPromptInput): string {
  const slicesJson = JSON.stringify(input.reportSlices, null, 2);
  const truncated =
    slicesJson.length > MAX_JSON_CHARS
      ? `${slicesJson.slice(0, MAX_JSON_CHARS)}\n… [truncated; ${slicesJson.length} chars total]`
      : slicesJson;

  const parts = [
    `You are writing the **Google Business Profile** assessment for a practice visibility report.`,
    ``,
    `**Practice:** ${input.practiceName}`,
    `**Place ID:** ${input.placeId}`,
    `**Address (from resolve):** ${input.formattedAddress}`,
  ];
  if (input.resolveRating != null || input.resolveReviewCount != null) {
    parts.push(
      `**Rating / reviews (from resolve step):** ${input.resolveRating ?? "—"} avg · ${input.resolveReviewCount ?? "—"} reviews`,
    );
  }
  parts.push(
    ``,
    `---`,
    ``,
    `## Data from Local Falcon`,
    ``,
    input.savedLocation
      ? jsonBlock("Saved location row (list locations / dashboard)", input.savedLocation)
      : "_No matching saved location row was returned from list locations (API may still have report data below)._",
    ``,
    input.listLocationsError
      ? `_list locations call: ${input.listLocationsError}_`
      : "",
    ``,
    `### Scan report excerpts (per keyword — merged listing-related fields from each full report payload)`,
    ``,
    "```json",
    truncated,
    "```",
    ``,
    `---`,
    ``,
    `## Your task`,
    ``,
    `Using **only** the Local Falcon data above (plus resolve rating/review counts), produce **markdown** for the report.`,
    ``,
    `### Assess (evidence-based; say **Not visible in data** when a field is missing):`,
    ``,
    `- **Reviews** — count and average rating (prefer data fields; align with resolve if both exist).`,
    `- **GBP description** — present or absent; approximate word count if text is available.`,
    `- **Categories** — primary/secondary if present.`,
    `- **Posts** — signals for recency: active, stale, or none / not in payload.`,
    `- **Services / products** — listed or not; depth if visible.`,
    `- **Photos** — quality/variety **only** if the payload gives signals; otherwise state unknown.`,
    `- **Q&A** — populated or not / not in payload.`,
    `- **Hours** — regular and holiday hours if present; accuracy cannot be verified against real-world clock—comment on completeness vs missing.`,
    ``,
    `### If data is thin`,
    ``,
    `Say so clearly. Do not invent GBP UI details. Do **not** substitute a competitor’s listing.`,
    ``,
    `### Playbook: no verified GBP (rare in this pipeline)`,
    ``,
    `If the evidence suggests **no usable GBP** for this practice (no listing payload, no place match), follow the playbook: lead with invisibility as the urgent finding; note that Local Search / grids are not meaningful without a GBP; do not use another business’s place_id.`,
    ``,
    `### Output`,
    ``,
    `Use headings and bullets. End with **Bottom line** (2–4 sentences) on GBP strength and priority fixes.`,
  );

  return parts.filter((p) => p != null).join("\n");
}

export const ANALYZE_GBP_SYSTEM_PROMPT =
  "You analyze Google Business Profile signals from Local Falcon exports. Output clear markdown. Never fabricate specific numbers or claims absent from the provided JSON; use phrases like 'not present in export' when needed.";
