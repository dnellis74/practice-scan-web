import { NextResponse } from "next/server";
import type { PipelineState } from "@/lib/pipeline/types";
import { fail } from "@/lib/pipeline/server-json";

/**
 * Chunk 3: analyze completed scan reports. Stub for now.
 */
export async function POST(req: Request) {
  let body: { state?: PipelineState };
  try {
    body = await req.json();
  } catch {
    return fail("analyze-scan", "Request body must be JSON", "invalid_json");
  }

  const state = body.state;
  if (!state?.resolve || !state.scans) {
    return fail(
      "analyze-scan",
      "resolve and scans steps must complete first",
      "missing_prereqs",
    );
  }

  return NextResponse.json({
    ok: true,
    step: "analyze-scan" as const,
    data: {
      summary: "Scan analysis stub (to be implemented).",
    },
  });
}
