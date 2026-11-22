/**
 * Save API for Syndicate Ledger (Cloudflare Worker + D1).
 *   GET  /save  -> { data, updatedAt } of the signed-in player, 404 if none yet
 *   PUT  /save  -> body { data: { "syndicate-ledger:...": "..." } } replaces the player's save
 * Each player can only reach their own row: it is keyed by the `sub` of a verified Auth0 token.
 */
import { verify, type Jwk } from './jwt';

/** The small part of Cloudflare D1 this Worker uses. */
export interface D1Like {
  prepare(sql: string): {
    bind(...v: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> };
  };
}

export interface Env {
  DB: D1Like;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  /** Comma-separated origins allowed to call the API, e.g. https://guhandelta.github.io */
  ALLOWED_ORIGINS: string;
}

const MAX_BYTES = 200_000;
const PREFIX = 'syndicate-ledger:';

let jwks: { at: number; keys: Jwk[] } | null = null;
async function keysFor(domain: string, fetcher: typeof fetch): Promise<Jwk[]> {
  if (jwks && Date.now() - jwks.at < 3_600_000) return jwks.keys;
  const res = await fetcher(`https://${domain}/.well-known/jwks.json`);
  if (!res.ok) throw new Error('jwks');
  jwks = { at: Date.now(), keys: ((await res.json()) as { keys: Jwk[] }).keys };
  return jwks.keys;
}
/** For tests. */
export const resetKeyCache = () => (jwks = null);

export function validBody(x: unknown): x is { data: Record<string, string> } {
  if (!x || typeof x !== 'object') return false;
  const d = (x as { data?: unknown }).data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  return Object.entries(d).every(([k, v]) => k.startsWith(PREFIX) && typeof v === 'string');
}

export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  const cors: Record<string, string> = allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : { Vary: 'Origin' };
  const reply = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (new URL(req.url).pathname !== '/save') return reply({ error: 'not found' }, 404);
  if (req.method !== 'GET' && req.method !== 'PUT') return reply({ error: 'method not allowed' }, 405);

  const bearer = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1];
  let claims = null;
  if (bearer) {
    try {
      claims = await verify(bearer, await keysFor(env.AUTH0_DOMAIN, fetcher), { issuer: `https://${env.AUTH0_DOMAIN}/`, audience: env.AUTH0_AUDIENCE });
    } catch {
      return reply({ error: 'cannot verify login right now' }, 503);
    }
  }
  if (!claims) return reply({ error: 'sign in first' }, 401);

  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').bind(claims.sub).first<{ data: string; updated_at: string }>();
    return row ? reply({ data: JSON.parse(row.data), updatedAt: row.updated_at }) : reply({ error: 'no save yet' }, 404);
  }

  const text = await req.text();
  if (text.length > MAX_BYTES) return reply({ error: 'save too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: 'bad json' }, 400);
  }
  if (!validBody(body)) return reply({ error: 'bad save' }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO saves (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3')
    .bind(claims.sub, JSON.stringify(body.data), now)
    .run();
  return reply({ ok: true, updatedAt: now });
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
