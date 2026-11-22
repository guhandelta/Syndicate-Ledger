/**
 * Cloud save, browser part: Auth0 login (authorization code + PKCE) and a debounced sync of the save keys
 * to the save API (workers/save-api). Everything is off, and invisible, until the VITE_* settings exist
 * (see docs/CLOUD-SAVE.md), so the game still works as a plain static site.
 */
import { Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';
import { fingerprint, mergeBundles, parseBundle, pickBundle, SAVE_PREFIX, type Bundle } from './merge';

const env = import.meta.env;
const DOMAIN = env.VITE_AUTH0_DOMAIN as string | undefined;
const CLIENT_ID = env.VITE_AUTH0_CLIENT_ID as string | undefined;
const AUDIENCE = env.VITE_AUTH0_AUDIENCE as string | undefined;
const API = (env.VITE_SAVE_API_URL as string | undefined)?.replace(/\/$/, '');

/** Where the fingerprint of the last synced save is kept (outside the save prefix, so it is never uploaded). */
const LAST_KEY = 'syndicate-ledger-sync:last';
const RELOADED_KEY = 'syndicate-ledger-sync:reloaded';
const PUSH_EVERY_MS = 5000;

export type CloudStatus = 'off' | 'loading' | 'signed-out' | 'signed-in' | 'error';

class Cloud {
  status = $state<CloudStatus>(DOMAIN && CLIENT_ID && AUDIENCE && API ? 'loading' : 'off');
  name = $state('');
  saving = $state(false);
  lastSynced = $state<Date | null>(null);
  private client: Auth0Client | null = null;

  private local(): Bundle {
    const entries: [string, string][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(SAVE_PREFIX)) entries.push([k, localStorage.getItem(k)!]);
    }
    return pickBundle(entries);
  }

  private async token() {
    return this.client!.getTokenSilently();
  }

  private async fetchCloud(): Promise<Bundle | null> {
    const res = await fetch(`${API}/save`, { headers: { Authorization: `Bearer ${await this.token()}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`save API ${res.status}`);
    return parseBundle(((await res.json()) as { data?: unknown }).data);
  }

  private async push(b: Bundle, keepalive = false) {
    const res = await fetch(`${API}/save`, {
      method: 'PUT',
      keepalive,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: b }),
    });
    if (!res.ok) throw new Error(`save API ${res.status}`);
    localStorage.setItem(LAST_KEY, fingerprint(b));
    this.lastSynced = new Date();
  }

  /** Call once at start-up, before the game reads its save. Never throws: a broken sync must not block play. */
  async init() {
    if (this.status === 'off') return;
    try {
      this.client = await createAuth0Client({
        domain: DOMAIN!,
        clientId: CLIENT_ID!,
        authorizationParams: { redirect_uri: location.origin + location.pathname, audience: AUDIENCE },
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
      });
      if (location.search.includes('code=') && location.search.includes('state=')) {
        const { appState } = await this.client.handleRedirectCallback();
        history.replaceState(null, '', location.pathname + ((appState as { hash?: string } | undefined)?.hash ?? ''));
      }
      if (!(await this.client.isAuthenticated())) {
        this.status = 'signed-out';
        return;
      }
      this.name = (await this.client.getUser())?.name ?? '';
      this.status = 'error'; // until the first pull works
      await this.pull();
      this.status = 'signed-in';
      setInterval(() => void this.sync(), PUSH_EVERY_MS);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void this.sync(true));
    } catch (e) {
      console.warn('cloud save unavailable', e);
      if (this.status === 'loading') this.status = 'signed-out';
    }
  }

  /** Brings the cloud save in. If that changes what this device holds, reload once so the game starts from it. */
  private async pull() {
    const local = this.local();
    const cloud = await this.fetchCloud();
    const dirty = fingerprint(local) !== localStorage.getItem(LAST_KEY);
    const merged = cloud ? mergeBundles(local, cloud, dirty) : local;
    const changed = fingerprint(merged) !== fingerprint(local);
    for (const [k, v] of Object.entries(merged)) localStorage.setItem(k, v);
    if (!cloud || fingerprint(merged) !== fingerprint(cloud)) await this.push(merged);
    else localStorage.setItem(LAST_KEY, fingerprint(merged));
    if (changed && sessionStorage.getItem(RELOADED_KEY) !== '1') {
      sessionStorage.setItem(RELOADED_KEY, '1');
      location.reload();
    }
  }

  private async sync(keepalive = false) {
    if (this.saving || this.status !== 'signed-in') return;
    const b = this.local();
    if (fingerprint(b) === localStorage.getItem(LAST_KEY)) return;
    this.saving = true;
    try {
      await this.push(b, keepalive);
    } catch (e) {
      console.warn('cloud save failed, will retry', e);
    } finally {
      this.saving = false;
    }
  }

  login = () => this.client?.loginWithRedirect({ appState: { hash: location.hash } });
  logout = () => this.client?.logout({ logoutParams: { returnTo: location.origin + location.pathname } });
}

export const cloud = new Cloud();
