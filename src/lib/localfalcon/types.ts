/**
 * Local Falcon REST API — shared response envelope (see OpenAPI).
 * https://docs.localfalcon.com/openapi.yaml
 */

export type LocalFalconEnvelope<T = unknown> = {
  code: number;
  code_desc: string | false;
  success: boolean;
  message: string | false;
  parameters?: Record<string, unknown>;
  data?: T;
};

export type ListLocationsData = {
  count?: number;
  next_token?: string;
  locations?: LocalFalconLocationRow[];
};

export type LocalFalconLocationRow = {
  id?: string;
  platform?: string;
  place_id?: string;
  name?: string;
  address?: string;
  lat?: string;
  lng?: string;
  rating?: string;
  reviews?: string;
  store_code?: string | boolean;
  url?: string;
  phone?: string;
  categories?: Record<string, string>;
  groups?: string[];
};

export type SearchBusinessLocationData = {
  count?: number;
  true_count?: number;
  results?: LocalFalconSearchResult[];
};

export type LocalFalconSearchResult = {
  platform?: string;
  place_id?: string;
  lat?: number;
  lng?: number;
  name?: string;
  address?: string;
  sab?: boolean;
  rating?: string;
  rating_pct?: number;
  reviews?: number;
  categories?: Record<string, string>;
  phone?: string;
  url?: string;
  display_url?: string;
  map_link?: string;
};

/** POST /v2/locations/add — API example uses `data: []` on success */
export type SaveBusinessLocationData = unknown[] | Record<string, unknown>;

export type ListScanReportsData = {
  count?: number;
  next_token?: string;
  reports?: LocalFalconReportSummary[];
};

export type LocalFalconReportSummary = {
  id?: string;
  checksum?: string;
  report_key?: string;
  timestamp?: string;
  date?: string;
  looker_date?: string;
  type?: string;
  platform?: string;
  place_id?: string;
  location?: Record<string, unknown>;
  keyword?: string;
  lat?: string;
  lng?: string;
  grid_size?: string;
  radius?: string;
  measurement?: string;
  data_points?: string;
  found_in?: string;
  arp?: string;
  atrp?: string;
  solv?: string;
  image?: string;
  heatmap?: string;
  pdf?: string;
  public_url?: string;
};

/** Full report payload is large; callers can narrow as needed. */
export type LocalFalconScanReportData = Record<string, unknown>;

export type GetScanReportProcessingData = {
  report_key?: string;
  status?: string;
};
