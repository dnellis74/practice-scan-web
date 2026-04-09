import { NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/anthropic";
import { AnthropicApiError } from "@/lib/anthropic/errors";
import type { MessagesResponse } from "@/lib/anthropic/types";
import { createLocalFalconClient } from "@/lib/localfalcon";
import { LocalFalconApiError } from "@/lib/localfalcon/errors";
import type { LocalFalconLocationRow } from "@/lib/localfalcon/types";
import {
  ANALYZE_GBP_SYSTEM_PROMPT,
  buildAnalyzeGbpPrompt,
  buildReportGbpSlices,
  sliceSavedLocationRow,
} from "@/lib/pipeline/build-analyze-gbp-prompt";
import { fail } from "@/lib/pipeline/server-json";
import type { PipelineState } from "@/lib/pipeline/types";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function assistantText(msg: MessagesResponse): string {
  let out = "";
  for (const block of msg.content ?? []) {
    if (
      block &&
      typeof block === "object" &&
      block.type === "text" &&
      typeof (block as { text?: string }).text === "string"
    ) {
      out += (block as { text: string }).text;
    }
  }
  return out.trim();
}

function pickSavedLocationRow(
  rows: LocalFalconLocationRow[] | undefined,
  placeId: string,
): LocalFalconLocationRow | null {
  const pid = placeId.trim();
  if (!rows?.length) return null;
  const exact = rows.find((r) => r.place_id?.trim() === pid);
  return exact ?? rows[0] ?? null;
}

/**
 * GBP assessment from Local Falcon saved listing + scan report payloads (SKILL.md).
 */
export async function POST(req: Request) {
  let body: { state?: PipelineState };
  try {
    body = await req.json();
  } catch {
    return fail("analyze-gbp", "Request body must be JSON", "invalid_json");
  }

  if (!body.state) {
    return fail("analyze-gbp", "Request body must include state", "missing_state");
  }
  const state = body.state;
  const placeId = state.resolve?.placeId?.trim();
  if (!placeId) {
    return fail(
      "analyze-gbp",
      "resolve step must complete with a place ID first",
      "missing_prereqs",
    );
  }
  if (!state.retrieveScans?.reports?.length) {
    return fail(
      "analyze-gbp",
      "retrieve-scans must complete first (need Local Falcon report payloads)",
      "missing_prereqs",
    );
  }

  let lf: ReturnType<typeof createLocalFalconClient>;
  try {
    lf = createLocalFalconClient();
  } catch {
    return fail(
      "analyze-gbp",
      "LOCALFALCON_API_KEY is not configured",
      "missing_api_key",
      500,
    );
  }

  let savedLocation: Record<string, unknown> | null = null;
  let listLocationsError: string | undefined;
  try {
    const listed = await lf.listAllLocalFalconLocations({
      query: placeId,
      limit: 100,
    });
    const row = pickSavedLocationRow(listed.data?.locations, placeId);
    if (row) {
      savedLocation = sliceSavedLocationRow(row);
    }
  } catch (e) {
    if (e instanceof LocalFalconApiError) {
      listLocationsError = e.message;
      console.warn("[analyze-gbp] list locations:", e.message);
    } else {
      throw e;
    }
  }

  const reportSlices = buildReportGbpSlices(state.retrieveScans.reports);
  const practiceName =
    state.input.practiceName?.trim() || state.resolve!.name.trim();

  const userPrompt = buildAnalyzeGbpPrompt({
    practiceName,
    placeId,
    formattedAddress: state.resolve!.formattedAddress,
    resolveRating: state.resolve!.rating,
    resolveReviewCount: state.resolve!.reviewCount,
    savedLocation,
    reportSlices,
    listLocationsError,
  });

  let anthropic: ReturnType<typeof createAnthropicClient>;
  try {
    anthropic = createAnthropicClient();
  } catch {
    return fail(
      "analyze-gbp",
      "ANTHROPIC_API_KEY is not configured",
      "missing_api_key",
      500,
    );
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const res = await anthropic.createMessage({
      model,
      max_tokens: 8192,
      system: ANALYZE_GBP_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const summary = assistantText(res);
    if (!summary) {
      return fail(
        "analyze-gbp",
        "Model returned no text content",
        "empty_response",
        500,
      );
    }

    const queryNotes = [
      listLocationsError
        ? `Saved-location list failed (${listLocationsError}); relied on report payloads.`
        : null,
      !savedLocation
        ? "No saved dashboard row matched; report JSON may still contain listing fields."
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    return NextResponse.json({
      ok: true,
      step: "analyze-gbp" as const,
      data: {
        summary,
        ...(queryNotes ? { queryNotes } : {}),
      },
    });
  } catch (e) {
    if (e instanceof AnthropicApiError) {
      console.error("[analyze-gbp] Anthropic API error:", e.message);
      return fail("analyze-gbp", e.message, "anthropic_error", 500);
    }
    throw e;
  }
}
