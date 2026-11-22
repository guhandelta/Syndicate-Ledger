import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handle, resetKeyCache, validBody, type D1Like, type Env } from '../workers/save-api/src/index';
import { verify } from '../workers/save-api/src/jwt';

const ISS = 'https://t.example.auth0.com/';
const AUD = 'https://api.example';
const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url');

let pair: CryptoKeyPair;
let jwk: { kid: string; kty: string; n: string; e: string };
beforeAll(async () => {
  pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pub = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as { n: string; e: string };
  jwk = { kid: 'k1', kty: 'RSA', n: pub.n, e: pub.e };
});

async function token(over: Record<string, unknown> = {}, header: Record<string, unknown> = {}, key?: CryptoKey) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', ...header }));
  const p = b64u(JSON.stringify({ sub: 'auth0|u1', iss: ISS, aud: AUD, exp: Math.floor(Date.now() / 1000) + 600, ...over }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key ?? pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

describe('jwt verify', () => {
  const opts = { issuer: ISS, audience: AUD };
  it('accepts a good token (string or list audience)', async () => {
    expect((await verify(await token(), [jwk], opts))?.sub).toBe('auth0|u1');
    expect(await verify(await token({ aud: ['x', AUD] }), [jwk], opts)).not.toBeNull();
  });
  it('rejects bad tokens', async () => {
    expect(await verify('nope', [jwk], opts)).toBeNull();
    expect(await verify('a.b', [jwk], opts)).toBeNull();
    expect(await verify(await token({}, { alg: 'HS256' }), [jwk], opts)).toBeNull();
    expect(await verify(await token({}, { kid: 'other' }), [jwk], opts)).toBeNull();
    expect(await verify(await token({ iss: 'https://evil/' }), [jwk], opts)).toBeNull();
    expect(await verify(await token({ aud: 'https://other' }), [jwk], opts)).toBeNull();
    expect(await verify(await token({ sub: '' }), [jwk], opts)).toBeNull();
    expect(await verify(await token({ exp: 1 }), [jwk], opts)).toBeNull();
    expect(await verify(await token({ nbf: Math.floor(Date.now() / 1000) + 999 }), [jwk], opts)).toBeNull();
    const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    expect(await verify(await token({}, {}, other.privateKey), [jwk], opts)).toBeNull();
  });
});

function fakeDb() {
  const rows = new Map<string, { data: string; updated_at: string }>();
  const db: D1Like = {
    prepare: (sql) => ({
      bind: (...v: unknown[]) => ({
        first: async <T>() => (rows.get(v[0] as string) as T | undefined) ?? null,
        run: async () => {
          if (sql.startsWith('INSERT')) rows.set(v[0] as string, { data: v[1] as string, updated_at: v[2] as string });
        },
      }),
    }),
  };
  return { db, rows };
}

const jwksFetch = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
let env: Env;
let rows: ReturnType<typeof fakeDb>['rows'];
beforeEach(() => {
  resetKeyCache();
  const f = fakeDb();
  rows = f.rows;
  env = { DB: f.db, AUTH0_DOMAIN: 't.example.auth0.com', AUTH0_AUDIENCE: AUD, ALLOWED_ORIGINS: 'https://game.example, http://localhost:5173' };
});
const call = async (method: string, init: { auth?: string | false; body?: string; path?: string; origin?: string } = {}) =>
  handle(
    new Request(`https://api.example${init.path ?? '/save'}`, {
      method,
      body: init.body,
      headers: { Origin: init.origin ?? 'https://game.example', ...(init.auth === false ? {} : { Authorization: `Bearer ${init.auth ?? (await token())}` }) },
    }),
    env,
    jwksFetch,
  );

describe('save API', () => {
  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await call('OPTIONS');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://game.example');
    expect((await call('GET', { origin: 'https://evil.example' })).headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('rejects missing, bad or foreign tokens', async () => {
    expect((await call('GET', { auth: false })).status).toBe(401);
    expect((await call('GET', { auth: 'junk' })).status).toBe(401);
  });
  it('404 for unknown paths, 405 for other methods', async () => {
    expect((await call('GET', { path: '/x' })).status).toBe(404);
    expect((await call('DELETE')).status).toBe(405);
  });
  it('stores and returns a save, per user', async () => {
    expect((await call('GET')).status).toBe(404);
    const data = { 'syndicate-ledger:save:v1': '{"a":1}' };
    const put = await call('PUT', { body: JSON.stringify({ data }) });
    expect(put.status).toBe(200);
    const got = await (await call('GET')).json();
    expect(got.data).toEqual(data);
    // another player sees nothing
    expect((await call('GET', { auth: await token({ sub: 'auth0|u2' }) })).status).toBe(404);
    expect(rows.size).toBe(1);
    // a second write replaces the first
    await call('PUT', { body: JSON.stringify({ data: { 'syndicate-ledger:b': 'x' } }) });
    expect((await (await call('GET')).json()).data).toEqual({ 'syndicate-ledger:b': 'x' });
  });
  it('rejects bad bodies and oversized saves', async () => {
    expect((await call('PUT', { body: '{' })).status).toBe(400);
    expect((await call('PUT', { body: JSON.stringify({ data: { evil: 'x' } }) })).status).toBe(400);
    expect((await call('PUT', { body: 'x'.repeat(200_001) })).status).toBe(413);
  });
  it('reports a login-check outage as 503', async () => {
    const res = await handle(new Request('https://api.example/save', { headers: { Authorization: `Bearer ${await token()}` } }), env, (async () => new Response('no', { status: 500 })) as unknown as typeof fetch);
    expect(res.status).toBe(503);
  });
  it('validates bodies', () => {
    expect(validBody(null)).toBe(false);
    expect(validBody({})).toBe(false);
    expect(validBody({ data: [] })).toBe(false);
    expect(validBody({ data: {} })).toBe(true);
  });
});
