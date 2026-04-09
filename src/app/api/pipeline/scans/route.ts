import { NextResponse } from "next/server";
import { createLocalFalconClient } from "@/lib/localfalcon";
import { LocalFalconApiError } from "@/lib/localfalcon/errors";
import type { LocalFalconRunScanGridSize } from "@/lib/localfalcon/types";
import { fail } from "@/lib/pipeline/server-json";
import type { PipelineState, ScanReportStub } from "@/lib/pipeline/types";

/** Allow sequential run-scan calls to finish (adjust on your Vercel plan). */
export const maxDuration = 120;

const DEFAULT_GRID_SIZE: LocalFalconRunScanGridSize = "5";

const DEFAULT_KEYWORDS = ["podiatrist", "foot doctor"] as const;

function clampRadiusMi(r: number): number {
  if (!Number.isFinite(r) || r <= 0) return 5;
  return Math.min(100, Math.max(0.1, r));
}

function parseOptionalMetric(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function scanStubFromRunData(
  keyword: string,
  data: Record<string, unknown> | undefined,
): ScanReportStub {
  const reportKey =
    typeof data?.report_key === "string" ? data.report_key : undefined;
  const image = typeof data?.image === "string" ? data.image : undefined;
  const heatmap =
    typeof data?.heatmap === "string" ? data.heatmap : undefined;
  return {
    keyword,
    reportKey,
    arp: parseOptionalMetric(data?.arp),
    solv: parseOptionalMetric(data?.solv),
    gridImageUrl: image ?? heatmap,
  };
}

/**
 * Run Local Falcon geo-grid scans per keyword using resolve.placeId and center
 * coordinates. Location must exist in saved locations (resolve handles that after search).
 *
 * @see https://docs.localfalcon.com/#tag/scans--reports/POST/v2/run-scan/
 */
export async function POST(req: Request) {
  let body: { state?: PipelineState };
  try {
    body = await req.json();
  } catch {
    return fail("scans", "Request body must be JSON", "invalid_json");
  }

  const state = body.state;
  if (!state?.resolve) {
    return fail("scans", "resolve step must complete first", "missing_resolve");
  }

  const { placeId, lat, lng } = state.resolve;
  if (!placeId?.trim()) {
    return fail("scans", "resolve.placeId is required", "missing_place_id");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(
      "scans",
      "resolve.lat and resolve.lng must be valid numbers",
      "invalid_coordinates",
    );
  }
  if (lat === 0 && lng === 0) {
    return fail(
      "scans",
      "resolve coordinates are missing or invalid (0,0)",
      "invalid_coordinates",
    );
  }

  let lf: ReturnType<typeof createLocalFalconClient>;
  try {
    lf = createLocalFalconClient();
  } catch {
    return fail(
      "scans",
      "LOCALFALCON_API_KEY is not configured",
      "missing_api_key",
      500,
    );
  }

  const scanRadiusMi = clampRadiusMi(
    state.input.radiusMi ??
      /* fallback until Census / CITY_RADIUS wiring */
      5,
  );
  const keywords = [...DEFAULT_KEYWORDS];

  try {
    const reports: ScanReportStub[] = [];
    for (const keyword of keywords) {
      const envelope = await lf.runScan({
        place_id: placeId.trim(),
        keyword,
        lat,
        lng,
        grid_size: DEFAULT_GRID_SIZE,
        radius: scanRadiusMi,
        measurement: "mi",
        platform: "google",
        // false = wait for scan to finish (needs maxDuration / plan headroom).
        // Set true if you hit serverless timeouts and poll GET report later.
        eager: false,
      });
      reports.push(
        scanStubFromRunData(
          keyword,
          envelope.data as Record<string, unknown> | undefined,
        ),
      );
    }

    return NextResponse.json({
      ok: true,
      step: "scans" as const,
      data: {
        scanRadiusMi,
        keywords,
        reports,
      },
    });
  } catch (e) {
    if (e instanceof LocalFalconApiError) {
      console.error("[scans] Local Falcon API error:", e.message);
      return fail("scans", e.message, "localfalcon_error", 500);
    }
    throw e;
  }
}
