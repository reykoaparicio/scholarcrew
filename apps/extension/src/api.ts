import {
  Activity,
  AutofillProfile,
  ErrorBody,
  type ErrorCode,
  type SavePageInput,
  ScholarshipSummary,
} from "@scholarcrew/domain";
import { z } from "zod";

export const RECONNECT_MESSAGE = "Your token expired. Create a new one in Settings.";

/**
 * R3A-4: responses are parsed with non-strict copies of the domain schemas. openapi lets v1 add response
 * fields, so an unknown key is stripped, never rejected. Field types and enums stay as strict as 02's.
 */
export const AutofillProfileResponse = z.object({
  ...AutofillProfile.shape,
  activities: z.array(z.object(Activity.shape)),
});
export const ScholarshipSummaryResponse = z.object(ScholarshipSummary.shape);

export type ApiErrorCode = ErrorCode | "network" | "bad_response";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;

  constructor(code: ApiErrorCode, message: string, status: number | null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  appUrl: string;
  token: string;
  fetch: FetchLike;
}

export interface ApiClient {
  getAutofillProfile(): Promise<AutofillProfile>;
  savePage(input: SavePageInput): Promise<ScholarshipSummary>;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = `${options.appUrl.replace(/\/+$/, "")}/api/v1/extension`;
  const doFetch = options.fetch;

  async function call<T>(method: "GET" | "POST", path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${options.token}`,
    };
    const init: RequestInit = { method, headers, credentials: "omit" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, init);
    } catch {
      throw new ApiError("network", `Can't reach ScholarCrew at ${options.appUrl}. Check the app address.`, null);
    }
    if (res.status === 401) throw new ApiError("unauthenticated", RECONNECT_MESSAGE, 401);
    if (res.status === 429 && path === "/save-page")
      throw new ApiError("rate_limited", "You've saved 10 pages today. Try again tomorrow.", 429);
    const json = await readJson(res);
    if (!res.ok) {
      const error = ErrorBody.safeParse(json);
      if (error.success) throw new ApiError(error.data.error.code, error.data.error.message, res.status);
      throw new ApiError("internal", `ScholarCrew returned ${res.status}.`, res.status);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        "bad_response",
        "ScholarCrew sent a reply this extension doesn't understand. Update the extension.",
        res.status,
      );
    }
    return parsed.data;
  }

  return {
    getAutofillProfile: () => call("GET", "/autofill-profile", undefined, AutofillProfileResponse),
    savePage: (input) => call("POST", "/save-page", input, ScholarshipSummaryResponse),
  };
}
