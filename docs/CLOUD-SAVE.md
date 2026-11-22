# Cloud save (Auth0 login + Cloudflare Worker + D1)

Players can sign in (Google, email, etc. through Auth0) so their progress follows them between devices.
Without the settings below the game behaves exactly as before: progress stays in the browser, and no login button shows.

## How it works

- The game keeps using `localStorage` (instant, works offline). Every key starting with `syndicate-ledger:` is the player's save:
  the running game, solved ranks per case, and the case notebook.
- Signed in, the browser checks every 5 seconds whether that save changed and uploads it to the **save API**
  (`workers/save-api`, a Cloudflare Worker). The Worker checks the Auth0 access token and stores one JSON row per player in **D1**
  (Cloudflare's free SQLite). A player can only ever reach the row for their own Auth0 user id.
- On sign-in or page load the cloud save is merged in: **solved ranks are always combined** (nothing is lost); for the running game
  and notebook, this device wins if it has changes the cloud has not seen yet (for example a guest who just signed in), otherwise the cloud wins.
  If the merge changes what the device holds, the page reloads once so the game starts from it.
- Puzzles are generated fresh, so a save is only a few KB. Limit: 200 KB per player.

## Setup (once, about 20 minutes, all free)

### 1. Auth0
1. Create a free tenant at auth0.com. Note the **domain** (for example `your-tenant.eu.auth0.com`).
2. Applications > Create Application > **Single Page Web Applications**. Note the **Client ID**.
3. In that application's settings set (comma-separate several):
   - Allowed Callback URLs: `https://guhandelta.github.io/Syndicate-Ledger/, http://localhost:5173/`
   - Allowed Logout URLs: the same
   - Allowed Web Origins: `https://guhandelta.github.io, http://localhost:5173`
   - Under Advanced > Grant Types make sure **Refresh Token** is ticked. Under Refresh Token Rotation, keep rotation on.
4. Applications > APIs > Create API: name `Syndicate Ledger API`, identifier (audience) `https://syndicate-ledger-api`, algorithm RS256.
5. Authentication > Social: Google is on by default for development. For production use your own Google keys (Auth0 shows a warning otherwise).

### 2. Cloudflare Worker and database
```bash
cd workers/save-api
npm install
npx wrangler login
npx wrangler d1 create syndicate-ledger      # copy the database_id it prints
```
Edit `wrangler.toml`: paste the `database_id`, set `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, and `ALLOWED_ORIGINS` (the game's origin; no secrets here).
```bash
npm run db:init                                # creates the table
npm run deploy                                 # prints https://syndicate-ledger-save.<you>.workers.dev
```

### 3. Tell the game
Under GitHub > Settings > Secrets and variables > Actions > **Variables** add (these are public values, not secrets):

| Variable | Value |
|---|---|
| `VITE_AUTH0_DOMAIN` | your tenant domain |
| `VITE_AUTH0_CLIENT_ID` | the SPA's Client ID |
| `VITE_AUTH0_AUDIENCE` | `https://syndicate-ledger-api` |
| `VITE_SAVE_API_URL` | the Worker URL |

Re-run the "Deploy to GitHub Pages" workflow. For Netlify or Vercel set the same four names in the site's environment variables.
For local play copy `.env.example` to `.env.local`.

## Privacy and security notes
- Nothing secret is in the repo. The Client ID, domain and API URL are public by design in a browser app.
- The Worker only accepts RS256 tokens issued by your tenant for your API audience, and only from the origins in `ALLOWED_ORIGINS`.
- The only personal data stored is the Auth0 user id next to the save. Deleting a player means deleting their row (`DELETE FROM saves WHERE user_id = ?`).
- Free-tier limits (Auth0, Workers, D1) change; check the providers' pricing pages. The game keeps working locally if the cloud is unreachable.

## Switching provider later
The game only needs three things from the cloud: a login, `GET /save` and `PUT /save`. Replacing the Worker with another backend means
re-implementing those two endpoints; `src/sync/merge.ts` and the game do not change.
