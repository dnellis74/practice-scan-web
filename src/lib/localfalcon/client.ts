import { LocalFalconApiError } from "./errors";
import type {
  GetScanReportProcessingData,
  ListLocationsData,
  ListScanReportsData,
  LocalFalconEnvelope,
  LocalFalconScanReportData,
  SaveBusinessLocationData,
  SearchBusinessLocationData,
} from "./types";

const DEFAULT_BASE = "https://api.localfalcon.com";

function toFormBody(
  fields: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (value === "") continue;
    p.set(key, String(value));
  }
  return p;
}

async function parseJsonEnvelope(
  res: Response,
  endpoint: string,
): Promise<LocalFalconEnvelope> {
  try {
    return (await res.json()) as LocalFalconEnvelope;
  } catch {
    throw new LocalFalconApiError("Local Falcon: response was not valid JSON", {
      code: res.status,
      httpStatus: res.status,
      endpoint,
    });
  }
}

/**
 * REST client for Local Falcon — maps to MCP tool names from SKILL.md.
 * Auth: Bearer token OR api_key in form (we use Bearer only; see OpenAPI).
 *
 * Use only on the server; keep {@link LOCALFALCON_API_KEY} out of client bundles.
 */
export class LocalFalconClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE,
  ) {}

  /**
   * MCP: listAllLocalFalconLocations → POST /v1/locations/
   */
  async listAllLocalFalconLocations(params?: {
    /** Matches name, address, Place ID, or store code */
    query?: string;
    limit?: number;
    next_token?: string;
  }): Promise<LocalFalconEnvelope<ListLocationsData>> {
    return this.postForm<ListLocationsData>("/v1/locations/", {
      query: params?.query,
      limit: params?.limit,
      next_token: params?.next_token,
    });
  }

  /**
   * MCP: searchForLocalFalconBusinessLocation → POST /v2/locations/search
   * Charged credits per successful search (see API docs).
   */
  async searchForLocalFalconBusinessLocation(params: {
    /** Business / practice name to search */
    term: string;
    /** City, state, country, etc. to narrow results */
    proximity?: string;
    platform?: "google" | "apple";
  }): Promise<LocalFalconEnvelope<SearchBusinessLocationData>> {
    return this.postForm<SearchBusinessLocationData>("/v2/locations/search", {
      name: params.term,
      proximity: params.proximity,
      platform: params.platform,
    });
  }

  /**
   * OpenAPI: saveBusinessLocation → POST /v2/locations/add
   * Saves a location to the dashboard. For `apple`, `name`, `lat`, and `lng` are required.
   */
  async saveBusinessLocation(params: {
    platform: "google" | "apple";
    place_id: string;
    name?: string;
    lat?: string;
    lng?: string;
  }): Promise<LocalFalconEnvelope<SaveBusinessLocationData>> {
    return this.postForm<SaveBusinessLocationData>("/v2/locations/add", {
      platform: params.platform,
      place_id: params.place_id,
      name: params.name,
      lat: params.lat,
      lng: params.lng,
    });
  }

  /**
   * MCP: listLocalFalconScanReports → POST /v1/reports/
   * Dates: MM/DD/YYYY
   */
  async listLocalFalconScanReports(params?: {
    start_date?: string;
    end_date?: string;
    place_id?: string;
    keyword?: string;
    grid_size?: string;
    campaign_key?: string;
    platform?: string;
    fields?: string;
    limit?: number;
    next_token?: string;
  }): Promise<LocalFalconEnvelope<ListScanReportsData>> {
    return this.postForm<ListScanReportsData>("/v1/reports/", {
      start_date: params?.start_date,
      end_date: params?.end_date,
      place_id: params?.place_id,
      keyword: params?.keyword,
      grid_size: params?.grid_size,
      campaign_key: params?.campaign_key,
      platform: params?.platform,
      fields: params?.fields,
      limit: params?.limit,
      next_token: params?.next_token,
    });
  }

  /**
   * MCP: getLocalFalconReport → POST /v1/reports/{report_key}/
   * May return HTTP 202 while scan is still processing.
   */
  async getLocalFalconReport(
    reportKey: string,
    params?: { ai_analysis?: boolean },
  ): Promise<
    | { httpStatus: 200; envelope: LocalFalconEnvelope<LocalFalconScanReportData> }
    | {
        httpStatus: 202;
        envelope: LocalFalconEnvelope<GetScanReportProcessingData>;
      }
  > {
    const path = `/v1/reports/${encodeURIComponent(reportKey)}/`;
    const endpoint = `${this.baseUrl}${path}`;
    const body = toFormBody({
      report_key: reportKey,
      ai_analysis: params?.ai_analysis,
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    const envelope = await parseJsonEnvelope(res, endpoint);

    if (res.status === 202) {
      return {
        httpStatus: 202,
        envelope: envelope as LocalFalconEnvelope<GetScanReportProcessingData>,
      };
    }

    if (res.status >= 400) {
      throw new LocalFalconApiError(`HTTP ${res.status}`, {
        code: res.status,
        httpStatus: res.status,
        endpoint,
        envelope,
      });
    }

    if (!envelope.success) {
      throw new LocalFalconApiError(
        typeof envelope.message === "string" && envelope.message
          ? envelope.message
          : `Local Falcon error (${envelope.code})`,
        {
          code: envelope.code,
          apiMessage: envelope.message,
          envelope,
          httpStatus: res.status,
          endpoint,
        },
      );
    }

    return {
      httpStatus: 200,
      envelope: envelope as LocalFalconEnvelope<LocalFalconScanReportData>,
    };
  }

  private async postForm<T>(
    path: string,
    fields: Record<string, string | number | boolean | undefined | null>,
  ): Promise<LocalFalconEnvelope<T>> {
    const body = toFormBody(fields);
    const endpoint = `${this.baseUrl}${path}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    const envelope = await parseJsonEnvelope(res, endpoint);

    if (!envelope.success) {
      throw new LocalFalconApiError(
        typeof envelope.message === "string" && envelope.message
          ? envelope.message
          : `Local Falcon error (${envelope.code})`,
        {
          code: envelope.code,
          apiMessage: envelope.message,
          envelope,
          httpStatus: res.status,
          endpoint,
        },
      );
    }

    if (res.status >= 400) {
      throw new LocalFalconApiError(`HTTP ${res.status}`, {
        code: res.status,
        httpStatus: res.status,
        endpoint,
        envelope,
      });
    }

    return envelope as LocalFalconEnvelope<T>;
  }
}
