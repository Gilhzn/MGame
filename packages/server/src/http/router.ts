import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyJwt } from '../auth/jwt.js';
import type { Clock } from '../util/clock.js';

// A deliberately small HTTP router — the meta API is a handful of JSON
// endpoints; no framework dependency needed.

export interface HttpRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  profileId: string | null; // from Bearer JWT, when present and valid
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export type Handler = (req: HttpRequest) => Promise<HttpResponse>;

interface Route {
  method: string;
  segments: string[]; // ':name' segments capture params
  handler: Handler;
  requireAuth: boolean;
}

export const json = (status: number, body: unknown): HttpResponse => ({ status, body });

export class Router {
  private routes: Route[] = [];

  constructor(
    private jwtSecret: string,
    private clock: Clock,
  ) {}

  add(method: string, path: string, handler: Handler, opts?: { auth?: boolean }): void {
    this.routes.push({
      method,
      segments: path.split('/').filter(Boolean),
      handler,
      requireAuth: opts?.auth ?? false,
    });
  }

  /** Route + execute. Exposed directly so tests can skip real sockets. */
  async dispatch(
    method: string,
    url: string,
    body: unknown,
    authHeader?: string,
  ): Promise<HttpResponse> {
    const parsed = new URL(url, 'http://local');
    const segments = parsed.pathname.split('/').filter(Boolean);

    let profileId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const claims = verifyJwt(authHeader.slice(7), this.jwtSecret, this.clock.now());
      if (claims) profileId = claims.sub;
    }

    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let match = true;
      for (let i = 0; i < segments.length; i++) {
        const rs = route.segments[i]!;
        const s = segments[i]!;
        if (rs.startsWith(':')) params[rs.slice(1)] = decodeURIComponent(s);
        else if (rs !== s) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      if (route.requireAuth && !profileId) return json(401, { error: 'UNAUTHORIZED' });
      try {
        return await route.handler({
          method,
          path: parsed.pathname,
          params,
          query: parsed.searchParams,
          body,
          profileId,
        });
      } catch (err) {
        return json(500, { error: 'INTERNAL', message: (err as Error).message });
      }
    }
    return json(404, { error: 'NOT_FOUND' });
  }

  /** node:http adapter. */
  listener() {
    return (req: IncomingMessage, res: ServerResponse): void => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        let body: unknown = undefined;
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw.length > 0) {
          try {
            body = JSON.parse(raw);
          } catch {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'MALFORMED_JSON' }));
            return;
          }
        }
        void this.dispatch(req.method ?? 'GET', req.url ?? '/', body, req.headers.authorization).then(
          (out) => {
            res.writeHead(out.status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(out.body ?? null));
          },
        );
      });
    };
  }
}
