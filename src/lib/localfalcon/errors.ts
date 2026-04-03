import type { LocalFalconEnvelope } from "./types";

function formatMessage(
  base: string,
  httpStatus: number | undefined,
  endpoint: string | undefined,
): string {
  if (httpStatus === undefined || endpoint === undefined) {
    return base;
  }
  return `${base} [HTTP ${httpStatus}; POST ${endpoint}]`;
}

export class LocalFalconApiError extends Error {
  /** Local Falcon JSON `code` when present, else HTTP status */
  readonly code: number;
  readonly apiMessage: string | false;
  readonly envelope?: LocalFalconEnvelope;
  /** Raw HTTP response status from fetch */
  readonly httpStatus?: number;
  /** Full URL that was requested (no query; path-only resources) */
  readonly endpoint?: string;

  constructor(
    message: string,
    options: {
      code: number;
      apiMessage?: string | false;
      envelope?: LocalFalconEnvelope;
      httpStatus?: number;
      endpoint?: string;
    },
  ) {
    const httpStatus = options.httpStatus ?? options.code;
    const endpoint = options.endpoint;
    super(formatMessage(message, httpStatus, endpoint));
    this.name = "LocalFalconApiError";
    this.code = options.code;
    this.apiMessage = options.apiMessage ?? false;
    this.envelope = options.envelope;
    this.httpStatus = options.httpStatus ?? options.code;
    this.endpoint = options.endpoint;
  }
}
