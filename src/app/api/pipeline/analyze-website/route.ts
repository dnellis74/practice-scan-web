import { NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/anthropic";
import { AnthropicApiError } from "@/lib/anthropic/errors";
import type { MessagesResponse } from "@/lib/anthropic/types";
import {
  ANALYZE_WEBSITE_SYSTEM_PROMPT,
  buildAnalyzeWebsitePrompt,
} from "@/lib/pipeline/build-analyze-website-prompt";
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

/**
 * Claude analysis of scraped site: platform, SSL, scheduling, content depth, etc.
 */
export async function POST(req: Request) {
  let body: { state?: PipelineState };
  try {
    body = await req.json();
  } catch {
    return fail("analyze-website", "Request body must be JSON", "invalid_json");
  }

  const state = body.state;
  if (!state?.website?.markdown?.trim()) {
    return fail(
      "analyze-website",
      "website step must complete with markdown first",
      "missing_prereqs",
    );
  }

  let anthropic: ReturnType<typeof createAnthropicClient>;
  try {
    anthropic = createAnthropicClient();
  } catch {
    return fail(
      "analyze-website",
      "ANTHROPIC_API_KEY is not configured",
      "missing_api_key",
      500,
    );
  }

  let userPrompt: string;
  try {
    userPrompt = buildAnalyzeWebsitePrompt(state);
  } catch (e) {
    return fail(
      "analyze-website",
      e instanceof Error ? e.message : String(e),
      "invalid_state",
      400,
    );
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const res = await anthropic.createMessage({
      model,
      max_tokens: 8192,
      system: ANALYZE_WEBSITE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const summary = assistantText(res);
    if (!summary) {
      return fail(
        "analyze-website",
        "Model returned no text content",
        "empty_response",
        500,
      );
    }

    return NextResponse.json({
      ok: true,
      step: "analyze-website" as const,
      data: { summary },
    });
  } catch (e) {
    if (e instanceof AnthropicApiError) {
      console.error("[analyze-website] Anthropic API error:", e.message);
      return fail("analyze-website", e.message, "anthropic_error", 500);
    }
    throw e;
  }
}
