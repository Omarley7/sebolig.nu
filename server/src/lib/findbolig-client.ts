import type { RecipientState, UserData } from "@/types";
import { apiResidenceToDomain, apiUserDataToDomain } from "./findbolig-domain";
import { ConnectionEnded, CredentialsRejected, FindboligUnavailable, UpstreamError } from "./errors";
import type { SealedSession } from "./session";
import type { ApiOffer, ApiOffersPage, ApiUserData } from "~/types/offers";
import type { ApiResidence, Residence } from "~/types/residences";
import type { ApiMessageThreadFull } from "~/types/threads";
import type { ApiPositionForProperty, ApiPropertySearchPage, ApiResidenceApplication } from "~/types/waiting-lists";

/** One request to findbolig.nu, as the client hands it to a transport. */
export interface FindboligRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path on findbolig.nu, e.g. `/api/users/me`. */
  path: string;
  /** Sent as JSON when present. */
  body?: unknown;
  /** The Cookie header carrying the findbolig session; may be empty. */
  cookie: string;
  timeoutMs: number;
}

/** findbolig.nu's answer. `json` is null for an empty or non-JSON body. */
export interface FindboligResponse {
  status: number;
  setCookie: string[];
  json: unknown;
}

/**
 * The port the findbolig client talks through: `http-transport.ts` in production,
 * `fake-findbolig.ts` in tests. A transport throws `FindboligUnavailable` when
 * findbolig.nu does not answer; every answer, whatever its status, is returned.
 */
export interface FindboligTransport {
  send(req: FindboligRequest): Promise<FindboligResponse>;
}

const TIMEOUT_LOGIN = 10_000; // 10s – user is waiting on a modal
const TIMEOUT_DATA = 20_000; // 20s – heavier data fetches

/** A request as the client's operations describe it: the cookie is the client's, the timeout defaults to TIMEOUT_DATA. */
type ClientRequest = Omit<FindboligRequest, "cookie" | "timeoutMs"> & { timeoutMs?: number };

export interface SearchOffersOptions {
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  pageSize?: number;
  page?: number;
  filters?: Record<string, unknown>;
  search?: string | null;
}

/**
 * One Connection's access to findbolig.nu. Owns the findbolig session (the cookie jar,
 * with findbolig's ASP.NET Set-Cookie quirks), renews it by silent re-authentication, and
 * turns findbolig's status codes into domain outcomes. Callers never see a status code or a
 * Set-Cookie header; the listings the delta walk and enrichment work over (offers, threads,
 * waiting-list rows) come back in findbolig's own shape for `findbolig-service.ts` to map.
 */
export class FindboligClient {
  /** How many times this client has renewed the findbolig session. */
  private renewals = 0;
  private renewing: Promise<void> | null = null;

  private constructor(
    private readonly transport: FindboligTransport,
    private jar: CookieJar,
    private readonly credentials: { email: string; password: string },
    private user: UserData,
  ) {}

  /**
   * Creates a Connection by logging in to findbolig.nu.
   * Throws `CredentialsRejected` when findbolig.nu refuses the email or password.
   */
  static async connect(transport: FindboligTransport, email: string, password: string): Promise<FindboligClient> {
    const { jar, user } = await logIn(transport, email, password);
    return new FindboligClient(transport, jar, { email, password }, user);
  }

  /** Restores a Connection from its sealed cookie. Contacts nobody. */
  static fromSession(transport: FindboligTransport, session: SealedSession): FindboligClient {
    return new FindboligClient(
      transport,
      CookieJar.fromHeader(session.fbCookies),
      { email: session.fbEmail, password: session.fbPassword },
      { email: session.email, fullName: session.fullName },
    );
  }

  /** The state to seal into the Connection cookie, including any renewed findbolig session. */
  get session(): SealedSession {
    return {
      fbCookies: this.jar.header(),
      fbEmail: this.credentials.email,
      fbPassword: this.credentials.password,
      fullName: this.user.fullName,
      email: this.user.email,
    };
  }

  /** Who findbolig.nu says the user is; also updates the identity sealed into the Connection. */
  async whoAmI(): Promise<UserData> {
    const json = await this.call({ method: "GET", path: "/api/users/me", timeoutMs: TIMEOUT_LOGIN }, "Failed to fetch user data");
    this.user = apiUserDataToDomain(json as ApiUserData);
    return this.user;
  }

  /** One page of the user's offers, in findbolig.nu's own shape. */
  async searchOffers(options: SearchOffersOptions = {}): Promise<ApiOffersPage> {
    const { orderBy = "created", orderDirection = "desc", pageSize = 2147483647, page = 0, filters = {}, search = null } = options;
    const json = await this.call(
      { method: "POST", path: "/api/search/offers", body: { search, filters, pageSize, page, orderDirection, orderBy } },
      "Failed to fetch offers",
    );
    return json as ApiOffersPage;
  }

  async getResidence(residenceId: string): Promise<Residence> {
    const json = await this.call({ method: "GET", path: `/api/models/residence/${residenceId}` }, "Failed to fetch residence");
    return apiResidenceToDomain(json as ApiResidence);
  }

  /** The message thread for an offer, or null when there is none. */
  async getThreadForOffer(offerId: string): Promise<ApiMessageThreadFull | null> {
    const json = await this.call(
      { method: "GET", path: `/api/communications/messages/thread/related-to/${offerId}` },
      "Failed to fetch thread for offer",
    );
    return json as ApiMessageThreadFull | null;
  }

  /** The user's position among the applicants for an offer. */
  async getPositionOnOffer(offerId: string): Promise<number | null> {
    const json = await this.call(
      { method: "GET", path: `/api/search/waiting-lists/applicants/position-on-offer/${offerId}` },
      "Failed to fetch position on offer",
    );
    return json as number | null;
  }

  acceptOffer(offerId: string): Promise<{ recipientState: RecipientState }> {
    return this.answerOffer(offerId, "accept", "OfferAccepted");
  }

  declineOffer(offerId: string): Promise<{ recipientState: RecipientState }> {
    return this.answerOffer(offerId, "decline", "OfferDeclined");
  }

  private async answerOffer(offerId: string, answer: "accept" | "decline", assumed: RecipientState) {
    const json = await this.call({ method: "POST", path: `/api/data/offers/${offerId}/${answer}` }, `Failed to ${answer} offer`);
    const state = (json as ApiOffer | null)?.recipients?.[0]?.state as RecipientState | undefined;
    return { recipientState: state ?? assumed };
  }

  /** Raw residence-application rows (one per applied residence) for the user. */
  async getResidenceApplications(): Promise<ApiResidenceApplication[]> {
    const json = await this.call({ method: "GET", path: "/api/data/residence-applications" }, "Failed to fetch residence applications");
    return json as ApiResidenceApplication[];
  }

  /** Property metadata for a batch of propertyIds, via the search endpoint. */
  async searchPropertiesByIds(propertyIds: string[]): Promise<ApiPropertySearchPage["results"]> {
    if (propertyIds.length === 0) return [];
    const json = await this.call(
      {
        method: "POST",
        path: "/api/search",
        body: { filters: { propertyId: propertyIds }, mixedResults: true, pageSize: propertyIds.length },
      },
      "Failed to search properties",
    );
    return (json as ApiPropertySearchPage).results ?? [];
  }

  /** The user's waiting-list position info for a property. Shape varies; see extractBestPosition. */
  async getPositionForProperty(propertyId: string): Promise<ApiPositionForProperty | null> {
    const json = await this.call(
      { method: "GET", path: `/api/search/waiting-lists/applicants/position-for-property/${propertyId}` },
      `Failed to fetch position for property ${propertyId}`,
    );
    return json as ApiPositionForProperty | null;
  }

  /** Reactivates a waiting list (property-level). */
  async setWaitingListActive(propertyId: string): Promise<void> {
    await this.call(
      { method: "PUT", path: `/api/data/residence-applications/property/${propertyId}/set-active` },
      `Failed to set waiting list active for property ${propertyId}`,
    );
  }

  /** Unsubscribes the user from a waiting list (property-level). */
  async unsubscribeFromWaitingList(propertyId: string): Promise<void> {
    await this.call(
      { method: "DELETE", path: `/api/data/residence-applications/property/${propertyId}` },
      `Failed to unsubscribe from waiting list for property ${propertyId}`,
    );
  }

  /**
   * Sends one request with the findbolig session and returns the body of a 2xx answer.
   * A 401 means findbolig.nu expired the findbolig session: renew it silently and retry once.
   */
  private async call(req: ClientRequest, what: string): Promise<unknown> {
    const sentWith = this.renewals;
    let res = await this.send(req);
    if (res.status === 401) {
      // Another call may have renewed the findbolig session while this one was in flight.
      if (this.renewals === sentWith) await this.renew();
      res = await this.send(req);
      if (res.status === 401) throw new ConnectionEnded("findbolig_session_lost");
    }
    ensureOk(res, what);
    return res.json;
  }

  private async send(req: ClientRequest): Promise<FindboligResponse> {
    // Merge into the jar the request went out with: if a parallel call renewed the findbolig
    // session meanwhile, a stale answer must not touch the fresh jar.
    const jar = this.jar;
    const res = await this.transport.send({ timeoutMs: TIMEOUT_DATA, ...req, cookie: jar.header() });
    jar.merge(res.setCookie);
    return res;
  }

  /**
   * Silent re-authentication with the stored credentials. Parallel calls that hit a 401
   * together (e.g. appointment enrichment's `Promise.all`) share one re-login.
   */
  private renew(): Promise<void> {
    this.renewing ??= this.reauthenticateSilently().finally(() => {
      this.renewing = null;
    });
    return this.renewing;
  }

  private async reauthenticateSilently(): Promise<void> {
    const { jar, user } = await logIn(this.transport, this.credentials.email, this.credentials.password).catch((error) => {
      // The password was changed on findbolig.nu: the Connection can never renew again.
      if (error instanceof CredentialsRejected) throw new ConnectionEnded("credentials_rejected");
      throw error;
    });
    this.jar = jar;
    this.user = user;
    this.renewals++;
  }
}

/** Logs in to findbolig.nu from scratch: an initial GET for the __Secure-SID cookie, then the login itself. */
async function logIn(transport: FindboligTransport, email: string, password: string) {
  const jar = new CookieJar();
  const landing = await transport.send({ method: "GET", path: "/", cookie: "", timeoutMs: TIMEOUT_LOGIN });
  jar.merge(landing.setCookie);

  const res = await transport.send({
    method: "POST",
    path: "/api/authentication/login",
    body: { email, password },
    cookie: jar.header(),
    timeoutMs: TIMEOUT_LOGIN,
  });
  if (res.status === 403) throw new CredentialsRejected();
  ensureOk(res, "Login failed");
  if (jar.merge(res.setCookie) === 0) throw new ConnectionEnded("findbolig_session_lost");
  return { jar, user: apiUserDataToDomain(res.json as ApiUserData) };
}

function ensureOk(res: FindboligResponse, what: string): void {
  if (res.status >= 200 && res.status < 300) return;
  if (res.status >= 500) throw new FindboligUnavailable(`${what}: findbolig.nu answered ${res.status}`, { status: res.status });
  throw new UpstreamError(`${what}: ${res.status}`, res.status);
}

/**
 * The findbolig session's cookies, kept as findbolig.nu would see them from a browser.
 *
 * findbolig.nu (ASP.NET Core / Kestrel) emits the real `.AspNet.Cookies` auth ticket
 * *and* a same-name deletion in the same login response. Concatenating both produced a
 * Cookie header with a duplicate, empty `.AspNet.Cookies` that findbolig.nu read instead
 * of the real ticket, causing 401s on every authenticated request. So within one response
 * a real value always beats a deletion of the same name, and a deletion only removes a
 * cookie when the response sets no value for it at all.
 *
 * e.g. [".AspNet.Cookies=val; HttpOnly", ".AspNet.Cookies=; Expires=...1970"]
 *      -> ".AspNet.Cookies=val"
 */
class CookieJar {
  private readonly cookies = new Map<string, string>(); // name -> value

  /** Seeds a jar from a Cookie header previously produced by `header()`. */
  static fromHeader(header: string): CookieJar {
    const jar = new CookieJar();
    for (const pair of header.split(";")) {
      const cookie = parseNameValue(pair);
      if (cookie) jar.cookies.set(cookie.name, cookie.value);
    }
    return jar;
  }

  /** Applies one response's Set-Cookie headers; returns how many cookies it set a value for. */
  merge(setCookieHeaders: string[]): number {
    const set = new Map<string, string>();
    const deleted = new Set<string>();
    for (const header of setCookieHeaders) {
      const cookie = parseNameValue(header.split(";")[0] ?? "");
      if (!cookie) continue;
      if (isDeletionCookie(header, cookie.value)) deleted.add(cookie.name);
      else set.set(cookie.name, cookie.value);
    }
    for (const name of deleted) if (!set.has(name)) this.cookies.delete(name);
    for (const [name, value] of set) this.cookies.set(name, value);
    return set.size;
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function parseNameValue(segment: string): { name: string; value: string } | null {
  const eq = segment.indexOf("=");
  if (eq === -1) return null;
  const name = segment.slice(0, eq).trim();
  if (!name) return null;
  return { name, value: segment.slice(eq + 1).trim() };
}

function isDeletionCookie(header: string, value: string): boolean {
  if (value === "") return true;
  const maxAge = header.match(/max-age\s*=\s*(-?\d+)/i);
  if (maxAge && Number(maxAge[1]) <= 0) return true;
  const expires = header.match(/expires\s*=\s*([^;]+)/i);
  if (expires) {
    const ts = Date.parse(expires[1].trim());
    if (!Number.isNaN(ts) && ts <= Date.now()) return true;
  }
  return false;
}
