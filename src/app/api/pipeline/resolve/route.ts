import { NextResponse } from "next/server";
import { createLocalFalconClient } from "@/lib/localfalcon";
import { LocalFalconApiError } from "@/lib/localfalcon/errors";
import {
  MIN_CONFIDENT_MATCH,
  pickBestSavedLocation,
  pickBestSearchResult,
} from "@/lib/localfalcon/match-practice";
import { fail } from "@/lib/pipeline/server-json";
import type { PipelineState, ResolveResult } from "@/lib/pipeline/types";
import type {
  LocalFalconLocationRow,
  LocalFalconSearchResult,
} from "@/lib/localfalcon/types";

function toResolveFromSaved(row: LocalFalconLocationRow): ResolveResult {
  const placeId = row.place_id ?? row.id ?? "";
  const lat = parseFloat(String(row.lat ?? "")) || 0;
  const lng = parseFloat(String(row.lng ?? "")) || 0;
  return {
    placeId,
    name: row.name ?? "",
    formattedAddress: row.address ?? "",
    lat,
    lng,
    websiteUrl: row.url?.trim() ? row.url : null,
    rating: row.rating ? parseFloat(row.rating) : undefined,
    reviewCount: row.reviews ? parseInt(String(row.reviews), 10) : undefined,
  };
}

function toResolveFromSearch(r: LocalFalconSearchResult): ResolveResult {
  const placeId = r.place_id ?? "";
  const lat =
    typeof r.lat === "number" ? r.lat : parseFloat(String(r.lat ?? 0)) || 0;
  const lng =
    typeof r.lng === "number" ? r.lng : parseFloat(String(r.lng ?? 0)) || 0;
  const reviews = r.reviews;
  return {
    placeId,
    name: r.name ?? "",
    formattedAddress: r.address ?? "",
    lat,
    lng,
    websiteUrl: r.url?.trim() ? r.url : null,
    rating: r.rating ? parseFloat(r.rating) : undefined,
    reviewCount:
      typeof reviews === "number"
        ? reviews
        : reviews != null
          ? parseInt(String(reviews), 10)
          : undefined,
  };
}

/**
 * Resolve practice → Google `placeId` via Local Falcon:
 * 1) saved locations, 2) search by name, 3) search by name + city/state proximity.
 */
export async function POST(req: Request) {
  let body: { state?: PipelineState };
  try {
    body = await req.json();
  } catch {
    return fail("resolve", "Request body must be JSON", "invalid_json");
  }

  const state = body.state;
  if (!state?.input?.practiceName?.trim()) {
    return fail("resolve", "input.practiceName is required", "missing_input");
  }

  let lf: ReturnType<typeof createLocalFalconClient>;
  try {
    lf = createLocalFalconClient();
  } catch {
    return fail(
      "resolve",
      "LOCALFALCON_API_KEY is not configured",
      "missing_api_key",
      500,
    );
  }

  const practiceName = state.input.practiceName.trim();
  const city = state.input.city?.trim();
  const region = state.input.state?.trim();
  const proximity =
    city || region ? [city, region].filter(Boolean).join(", ") : "";

  try {
    const listed = await lf.listAllLocalFalconLocations({
      query: practiceName,
      limit: 100,
    });
    const locations = listed.data?.locations ?? [];
    const saved = pickBestSavedLocation(locations, practiceName);
    if (saved) {
      const data = toResolveFromSaved(saved.row);
      if (!data.placeId) {
        console.warn(
          "[resolve] Saved location match had empty place_id; continuing to search",
        );
      } else {
        console.log(
          "[resolve] Matched saved Local Falcon location:",
          data.placeId,
          data.name,
          `(score ${saved.score.toFixed(2)})`,
        );
        return NextResponse.json({
          ok: true,
          step: "resolve" as const,
          data,
        });
      }
    }

    const searchName = await lf.searchForLocalFalconBusinessLocation({
      term: practiceName,
      platform: "google",
    });
    const resultsName = searchName.data?.results ?? [];
    let best = pickBestSearchResult(resultsName, practiceName);

    const needsProximity =
      (best == null || best.score < MIN_CONFIDENT_MATCH) &&
      Boolean(proximity);

    if (needsProximity) {
      console.log(
        "[resolve] No confident name-only match; searching with proximity:",
        proximity,
      );
      const searchProx = await lf.searchForLocalFalconBusinessLocation({
        term: practiceName,
        proximity,
        platform: "google",
      });
      const resultsProx = searchProx.data?.results ?? [];
      const bestProx = pickBestSearchResult(resultsProx, practiceName);
      if (
        bestProx &&
        (!best || bestProx.score > best.score)
      ) {
        best = bestProx;
      }
    }

    if (!best || best.score < MIN_CONFIDENT_MATCH) {
      return fail(
        "resolve",
        "Could not confidently match a Google Business location for this practice. Try adjusting the name or add city and state.",
        "no_match",
      );
    }

    const data = toResolveFromSearch(best.result);
    if (!data.placeId) {
      return fail(
        "resolve",
        "Local Falcon returned a match without a place_id",
        "missing_place_id",
      );
    }

    console.log(
      "[resolve] Matched via search:",
      data.placeId,
      data.name,
      `(score ${best.score.toFixed(2)})`,
    );

    return NextResponse.json({
      ok: true,
      step: "resolve" as const,
      data,
    });
  } catch (e) {
    if (e instanceof LocalFalconApiError) {
      console.error("[resolve] Local Falcon API error:", e.message);
      return fail("resolve", e.message, "localfalcon_error", 500);
    }
    throw e;
  }
}
