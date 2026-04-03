import type {
  LocalFalconLocationRow,
  LocalFalconSearchResult,
} from "./types";

/** Minimum score (0–1) to treat a row as a confident match */
export const MIN_CONFIDENT_MATCH = 0.68;

function normalizeBusinessName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heuristic similarity for practice name vs API result name.
 * Favors exact / substring matches and shared significant tokens.
 */
function scoreNameMatch(query: string, candidate: string): number {
  const q = normalizeBusinessName(query);
  const c = normalizeBusinessName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.92;

  const qTokens = q.split(" ").filter((t) => t.length > 1);
  const cTokens = c.split(" ").filter((t) => t.length > 1);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  const cSet = new Set(cTokens);
  let hits = 0;
  for (const t of qTokens) {
    if (cSet.has(t)) {
      hits += 1;
      continue;
    }
    if (cTokens.some((ct) => ct.includes(t) || t.includes(ct))) {
      hits += 0.65;
    }
  }
  const overlap = hits / qTokens.length;
  return Math.min(0.95, overlap * 0.85);
}

export function pickBestSavedLocation(
  locations: LocalFalconLocationRow[],
  practiceName: string,
): { row: LocalFalconLocationRow; score: number } | null {
  let best: { row: LocalFalconLocationRow; score: number } | null = null;
  for (const row of locations) {
    const name = row.name?.trim();
    if (!name) continue;
    const score = scoreNameMatch(practiceName, name);
    if (score >= MIN_CONFIDENT_MATCH && (!best || score > best.score)) {
      best = { row, score };
    }
  }
  return best;
}

export function pickBestSearchResult(
  results: LocalFalconSearchResult[],
  practiceName: string,
): { result: LocalFalconSearchResult; score: number } | null {
  let best: { result: LocalFalconSearchResult; score: number } | null = null;
  for (const result of results) {
    const name = result.name?.trim();
    if (!name) continue;
    const score = scoreNameMatch(practiceName, name);
    if (!best || score > best.score) {
      best = { result, score };
    }
  }
  return best;
}
