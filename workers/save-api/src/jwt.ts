/** Verifies an Auth0 access token (RS256) with WebCrypto only, so the Worker needs no dependencies. */

export interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
export interface Claims { sub: string; iss: string; aud: string | string[]; exp: number; nbf?: number }

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = <T>(s: string) => JSON.parse(new TextDecoder().decode(b64(s))) as T;

/** Returns the token's claims, or null when it is malformed, wrongly signed, expired or meant for someone else. */
export async function verify(
  token: string,
  keys: Jwk[],
  opts: { issuer: string; audience: string; now?: number },
): Promise<Claims | null> {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const header = json<{ alg: string; kid: string }>(h);
    if (header.alg !== 'RS256') return null;
    const jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = json<Claims>(p);
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (c.iss !== opts.issuer || !aud.includes(opts.audience) || typeof c.sub !== 'string' || !c.sub) return null;
    if (typeof c.exp !== 'number' || c.exp <= now || (c.nbf !== undefined && c.nbf > now)) return null;
    return c;
  } catch {
    return null;
  }
}
