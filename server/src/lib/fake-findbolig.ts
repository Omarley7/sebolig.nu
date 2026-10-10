import { TimeoutError, UnreachableError } from "./errors";
import type { FindboligRequest, FindboligResponse, FindboligTransport } from "./findbolig-client";

/** What a route handler of the fake answers; omitted fields default to 200, no cookies, no body. */
export type FakeAnswer = Partial<FindboligResponse>;
/** How findbolig.nu is down: not answering in time, not reachable, or answering with this 5xx. */
export type Outage = "timeout" | "unreachable" | number;
export type FakeHandler = (req: FindboligRequest) => FakeAnswer | Promise<FakeAnswer>;

/**
 * An in-memory findbolig.nu for tests, speaking the same transport port as the real
 * HTTP adapter. It handles the login handshake itself (including the ASP.NET Set-Cookie
 * quirks findbolig.nu really sends) and only answers the data paths a test routes with
 * `on(...)`. A data call without a live findbolig session gets 401, like the real site.
 */
export class FakeFindbolig implements FindboligTransport {
  /** Every request received, in order; lets a test count logins or upstream calls. */
  readonly requests: FindboligRequest[] = [];
  /** When set, every request fails as if findbolig.nu were down. */
  outage: Outage | null = null;
  /** When set, only the login handshake fails as if findbolig.nu were down. */
  loginOutage: Outage | null = null;
  /** When true, a login succeeds but sets no findbolig session cookie. */
  loginWithoutSession = false;

  private readonly accounts = new Map<string, { password: string; fullName: string }>();
  private readonly handlers = new Map<string, FakeHandler>();
  private readonly liveTickets = new Set<string>();
  private ticketCount = 0;

  addAccount(email: string, password: string, fullName: string): this {
    this.accounts.set(email, { password, fullName });
    return this;
  }

  changePassword(email: string, password: string): void {
    const account = this.accounts.get(email);
    if (account) account.password = password;
  }

  /** findbolig.nu forgets every findbolig session it has granted. */
  expireSessions(): void {
    this.liveTickets.clear();
  }

  /** Routes `"METHOD /path"` to a handler, which only runs for a request with a live findbolig session. */
  on(route: string, handler: FakeHandler): this {
    this.handlers.set(route, handler);
    return this;
  }

  /** How many login attempts reached the fake. */
  get loginCount(): number {
    return this.requests.filter((r) => r.path === "/api/authentication/login").length;
  }

  async send(req: FindboligRequest): Promise<FindboligResponse> {
    this.requests.push(req);
    await Promise.resolve(); // answer asynchronously, like the network does

    const isLogin = req.path === "/" || req.path === "/api/authentication/login";
    const outage = this.outage ?? (isLogin ? this.loginOutage : null);
    if (outage === "timeout") throw new TimeoutError(`https://findbolig.nu${req.path}`, 10_000);
    if (outage === "unreachable") {
      throw new UnreachableError(`https://findbolig.nu${req.path}`, new TypeError("fetch failed"));
    }
    if (typeof outage === "number") return answer({ status: outage });

    if (req.method === "GET" && req.path === "/") {
      return answer({ setCookie: ["__Secure-SID=sid-fake; path=/; secure; httponly"] });
    }
    if (req.method === "POST" && req.path === "/api/authentication/login") return this.login(req);

    const route = `${req.method} ${req.path}`;
    const handler = this.handlers.get(route);
    if (!handler) throw new Error(`The fake findbolig.nu has no route for ${route}`);
    if (!this.hasLiveTicket(req.cookie)) return answer({ status: 401 });
    return answer(await handler(req));
  }

  private login(req: FindboligRequest): FindboligResponse {
    const { email, password } = req.body as { email: string; password: string };
    const account = this.accounts.get(email);
    if (!account || account.password !== password) {
      // findbolig.nu's observed answer to a wrong email or password (2026-09-05)
      return answer({ status: 403, json: { message: "Invalid username or password", errorCode: 105 } });
    }
    const user = { email, notifications: { fullName: account.fullName } };
    if (this.loginWithoutSession) return answer({ json: user });

    const ticket = `ticket-${++this.ticketCount}`;
    this.liveTickets.add(ticket);
    return answer({
      json: user,
      // The real login response sets the auth ticket *and* a same-name deletion, alongside
      // deletions for cookies the client never had.
      setCookie: [
        `.AspNet.Cookies=${ticket}; path=/; secure; httponly; samesite=lax`,
        ".AspNet.Cookies=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
        ".AspNet.ExternalCookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
      ],
    });
  }

  private hasLiveTicket(cookie: string): boolean {
    const ticket = cookie.match(/(?:^|;\s*)\.AspNet\.Cookies=([^;]*)/)?.[1];
    return !!ticket && this.liveTickets.has(ticket);
  }
}

function answer({ status = 200, setCookie = [], json = null }: FakeAnswer): FindboligResponse {
  return { status, setCookie, json };
}
