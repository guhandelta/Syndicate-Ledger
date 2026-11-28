# Backend plan: a progress API that builds the next puzzle, on free hosting

Status: **proposal for review, nothing built.** Written 2026-11-28, to be reviewed after the current puzzle work
(decode links, Detective leads, new puzzle types) is finished. No game code changes with this document.

Each claim below is marked:
- **[verified]**: read on the provider's own page on 2026-11-28 (pages listed in section 9), or read in this repo's code.
- **[inferred]**: my estimate or reasoning, not checked. Treat these as things to test before relying on them.

---

## 1. Where the game is today [verified, from the repo]

- The game runs fully in the browser. A save is the `localStorage` keys starting `syndicate-ledger:` (the running
  `GameState`, solved ranks per case, the notebook).
- Puzzles are built from a seed. `buildRank(cf, preset, { runSeed })` in `src/game/buildRank.ts` builds every lead of a
  rank in order, and each lead's link clues quote the earlier answers of that rank (`planLinks`, `planCarry`,
  `checkLinks` in `src/game/links.ts`). The same seed always rebuilds the same puzzles. Seed 0 is the shipped case.
- `buildRankFresh` tries neighbouring seeds when one can't be built. It runs in a Web Worker (`rankWorker.ts`,
  `rankClient.ts`) with a 45 s budget, then falls back to the shipped puzzles.
- Junior, Detective and Inspector build fresh per game (`FRESH_RANKS`). Chief ships fixed puzzles because a linked 7x7
  rank took over 20 minutes to build.
- The save keeps `seed` and the built `puzzles`, so an update of the generator can't change a puzzle under a player's notes.
- An optional cloud save already exists (PR #64, `docs/CLOUD-SAVE.md`): Auth0 login, a Cloudflare Worker
  (`workers/save-api`) with `GET /save` and `PUT /save`, and one JSON row per player in Cloudflare D1. It is not deployed yet.

So the backend does not start from zero: login, a Worker, a database and a merge rule are written. What is missing is
(a) progress the server understands, rather than an opaque blob, and (b) a server that decides what the next puzzle is.

---

## 2. What the API has to do

1. **Know the player's progress**: case, rank, character, which leads and puzzles are solved, how they were solved
   (time, hints, wrong marks, accusations), story choices and flags, and the **current point of investigation**
   (the story beat the player is at, the open leads, the clock).
2. **Pick and hand out the next puzzle** from that progress, on demand: which lead opens next, which puzzle type and
   difficulty, which earlier answers it links to, and optional side puzzles (the psychological puzzle backlog).
3. **Keep working when it is down or over its free limits.** The game must never block on the server.

---

## 3. The key design choice: the server plans, the browser builds

The obvious design is "the server generates the puzzle". On the free hosts it does not fit:

| Rank | Build time today | Fits a Cloudflare Worker (10 ms CPU per request)? | Fits a small server? |
|---|---|---|---|
| Junior 4x4 | milliseconds [verified, code comment] | No for a whole rank, maybe for one lead [inferred] | Yes |
| Detective 5x5 | under a second [inferred] | No | Yes |
| Inspector 6x6 | ~4 to 9 s in Node [verified, earlier measurement] | No | Yes, but one request at a time on a tiny free box [inferred] |
| Chief 7x7 linked | over 20 min [verified, earlier measurement] | No | No, too slow for any request |

**Proposal:** the server never builds puzzles in a request. It sends a small **build ticket**, and the browser builds
the puzzle with the same `buildRank` code it already runs in the worker:

```jsonc
// POST /runs/{runId}/next  ->
{
  "ticket": {
    "caseId": "case1",
    "preset": "inspector",
    "leadId": "L3",
    "seed": 291834771,          // the seed the browser must build from
    "generator": "2026.11.28",  // the generator version the seed belongs to
    "links": ["L1", "L2"],      // which earlier answers it may quote (from the case file's `links`)
    "level": { "minGrade": 3 }, // optional difficulty nudge, within the rank's rules
    "side": null                // or a side puzzle, see section 5
  },
  "beat": "inspector.after-L2", // the point of investigation the player is now at
  "prebuild": ["L4"]            // what the browser may start building during the next story scene
}
```

Why this fits:
- **It is cheap for the server** (a few database reads and a hash), so it runs inside the Worker's 10 ms CPU. [inferred]
- **It reuses what exists**: seeds, link chains, the worker, the 45 s budget and the shipped fallback.
- **It stays deterministic**: the server can always rebuild a player's puzzle later (offline) from the ticket, for support or checking.
- **Chief is handled by a pool** (section 6): seeds that are known to build are prepared offline and handed out by the server.

The one code change this needs later (not now): split the loop in `buildRank` into a `buildLead(cf, preset, lead, seed, earlierAnswers)`
so the browser can build one lead at a time from the answers the player actually reached, instead of the whole rank at once.
The body of the loop is already per-lead, so this is a refactor, not a rewrite. [verified that the loop is per-lead; the refactor size is inferred]

### Generator versions
A seed only rebuilds the same puzzle with the same generator code. Every ticket carries `generator`. The browser builds a ticket
only if its own version matches; if not, it asks for a new ticket, and the save keeps the built `puzzles` as it does today.
The build writes its version into the bundle (for example from `package.json` plus the commit). [inferred design]

---

## 4. Progress model (what is stored)

Stored per player, keyed only by the Auth0 user id (`sub`), as today. Plain tables; the same SQL works on D1 (SQLite) and Postgres.

```sql
players   (user_id PK, created_at, last_seen_at)
runs      (run_id PK, user_id, case_id, preset, character, seed, generator,
           status /* playing | busted | lost | abandoned */, beat, hours_used,
           started_at, ended_at)
leads     (run_id, lead_id, puzzle_type, seed, opened_at, solved_at,
           seconds_spent, hints_used, wrong_marks, tips_paid, answer_digest,
           PRIMARY KEY (run_id, lead_id))
choices   (run_id, at, kind /* flag | accuse | offer | ending */, value)
events    (run_id, seq, at, type, payload_json)   -- append-only, trimmed after 90 days
ranks     (user_id, case_id, preset, character, best_ending, solved_at)  -- what unlocks the next rank
```

- **Current point of investigation** = `runs.beat` plus the open rows in `leads` plus `choices`. The beat id names a story
  scene in the case file (the rank story's leads, handovers and events), so the server and browser agree on where the player is.
- **Events** are what the browser sends; the other tables are updated from them in the same request. Events let later
  features (adaptive difficulty, playtest stats) be computed again without changing the game.
- `answer_digest` is a hash of the solved answer, not the answer. It lets the server check that the next lead's links were planted
  from the answer the player really reached, without storing grids. [inferred design]
- **Size** [inferred]: a run with 5 leads is under ~30 rows; at 200 KB per player (today's cap) D1's 500 MB per database holds
  well over 2,000 players, and the 5 GB account total allows more databases.
- The existing `saves` table and `GET/PUT /save` stay. The blob is still how a device restores the full `GameState`
  (notes, pencil marks). The new tables are the part the server reasons about.

Guests keep playing locally, exactly as now. On sign-in, local runs are uploaded as events and merged with the existing rule in
`src/sync/merge.ts` (solved ranks are always combined). [verified that merge.ts combines solved ranks]

---

## 5. How the next puzzle is picked

`POST /runs/{id}/next` runs these steps, in order. All of them are table lookups against the case file and the run. [inferred design]

1. **Which leads may open**: a lead opens when its `opensAfter` leads are solved (as in the case file today). Story events and
   flags can add or remove leads (for example a witness who left).
2. **Which one is next**: the case file's order, unless the player chose a lead on the case board. The rule book's "3 of 4 leads"
   rule stays a case-file rule, not a server rule.
3. **Which earlier answers it links to**: the lead's `links` at this rank, filtered to the leads the player actually solved.
   If a link's source is unsolved, its fallback link or no link is used (the fallback ladder in `docs/LINKED-PUZZLES.md`, section 7).
4. **Difficulty nudge, within the rank's limits**: from the player's last two leads (time, hints, wrong marks), move one step inside
   the rank's allowed grade range. It never goes below the rank's minimum grade (the approved no-easy-path rule). Off by default
   until playtests say it helps.
5. **Side puzzles**: when the story beat allows one and the player's choices fit, add an optional side puzzle (for example one of
   the psychological puzzles once they exist). A side puzzle is a ticket like any other, with `side` set and its own seed.
6. **Seed**: `hash(runSeed, leadId, attempt)`, the same formula as `leadSeed` today. For Chief, take the next unused seed from the
   pool (section 6).
7. **Prebuild hint**: the most likely next lead, so the browser can build it during the story scene (the spinner rule Guha already approved).

If the server cannot be reached, the browser does steps 1 to 6 itself with the same functions (they live in shared code), and sends
the events later. The server is an authority when it is up, and never a requirement. [inferred design]

### Cheating
Low stakes today (no leaderboards). Plan: trust the browser, store the digest, and rebuild a sample of tickets offline to spot
impossible solve times. A leaderboard later would need server-side checks of the solution, which for a stored ticket is a fast
"does this grid meet the statements" check, not a fresh build. [inferred]

---

## 6. Chief 7x7: a prepared seed pool

Chief can't be built on demand, by the browser or by a free server. Instead:

1. A scheduled job runs `npm run generate`-style builds for Chief with many run seeds (the script already has env switches such as `ONLY_PRESET`).
2. Each seed that builds within budget is written to a `pool` table: `(case_id, preset, generator, seed, built_at)`. Optionally the built
   book is stored too, so the browser downloads it instead of building it.
3. `/next` hands each Chief run an unused pool seed for the current generator version.

Where the job runs: **GitHub Actions on the public repo** is the natural free home. I recall that standard runners are free for public
repositories and a job may run up to 6 hours, but I did not re-check this today. **[inferred, check before relying on it]** A local
run on Guha's computer works too.

---

## 7. Endpoints

All behind the same Auth0 token check the save Worker already does. Guests never call them.

| Method | Path | Does |
|---|---|---|
| GET | `/save` , PUT `/save` | Unchanged (full device save). |
| GET | `/me` | Ranks solved per case and character, open runs. Drives the start screen and the "welcome back" page. |
| POST | `/runs` | Start a run: `{caseId, preset, character}` -> `{runId, seed, generator, beat, ticket}`. Refuses a rank that isn't unlocked. |
| GET | `/runs/{id}` | The run's progress and current beat. |
| POST | `/runs/{id}/events` | A batch of events (lead opened, statement marked, hint, solved, choice, accusation, beat reached). Idempotent by `seq`. |
| POST | `/runs/{id}/next` | The next ticket (section 5). |
| GET | `/pool/{case}/{preset}` | Internal use by `/next`; not public. |

Batching: the browser sends events at each story beat and when the page is hidden, not on every click, so a session costs tens of
requests, not thousands. [inferred]

---

## 8. Hosting on free tiers

### 8.1 Recommendation: stay on Cloudflare Worker + D1 (what PR #64 already uses)

Because the server only plans (section 3), the Worker's 10 ms CPU limit is not a problem, and it does not sleep.

| Limit (Workers Free / D1 Free) | Value | Source |
|---|---|---|
| CPU per request | 10 ms (error 1102 beyond it) | [verified] |
| Requests | 100,000 per day, reset at midnight UTC | [verified] |
| Memory | 128 MB | [verified] |
| D1 rows read / written | 5 million / 100,000 per day | [verified] |
| D1 storage | 500 MB per database, 5 GB per account, 10 databases | [verified] |
| D1 over the daily limit | queries fail until midnight UTC; data is kept (enforced since 2026-09-01) | [verified] |
| D1 Time Travel restore | 7 days | [verified] |
| Auth0 Free | up to 25,000 monthly active users, social logins included | [verified] |

What that means for the game [inferred]: at ~50 requests and ~200 row writes per play session, the write limit is the first one hit,
at around 500 sessions a day. Far above what a playtest needs. When it is hit, the game keeps working locally and uploads the next day,
because the client is local-first.

### 8.2 Alternative: Render web service + Neon Postgres

Use this only if server-side puzzle building becomes a must (for example a puzzle type that must stay secret from the browser).

| Limit | Value | Source |
|---|---|---|
| Render free web service | sleeps after 15 min idle, ~1 min to wake, 750 instance hours per month per workspace, one instance, no persistent disk | [verified] |
| Render free Postgres | expires 30 days after creation (deleted after a 14-day grace) | [verified]: **do not use it** |
| Render CPU / RAM | not stated on the free page | [verified that it is not stated] |
| Neon Free | 100 projects, 1 GB storage per project, 100 CU-hours per project per month, scales to zero after 5 min, 10 branches, 5 GB egress per month | [verified] |
| Neon over limits | compute suspended until next month; data kept | [verified] |

Costs of this route [inferred]: the first request after 15 minutes waits about a minute; Inspector builds (4 to 9 s) would block the one
small instance for other players; Chief still needs the pool. 750 hours is just over one always-on service for a month (31 x 24 = 744),
so a keep-alive ping is possible but uses the whole allowance.

### 8.3 Ruled out (from the earlier comparison in this project, not re-checked today)
Deno Deploy (announced sunset), Railway (free credit only), Fly.io (card required), Supabase free projects (pause after about a week idle).
**[inferred, from the 2026-11-22 and 2026-11-28 comparisons]**

### 8.4 Environments

| Environment | Game | API | Database | Auth0 |
|---|---|---|---|---|
| Local | `npm run dev` | `wrangler dev` (local D1 file) | local SQLite | dev SPA app, `localhost` callbacks |
| Preview | Netlify/Vercel preview or a Pages branch | Worker `syndicate-ledger-api-preview` | D1 database `syndicate-ledger-preview` | same tenant, preview callback URLs |
| Production | GitHub Pages (as now) | Worker `syndicate-ledger-api` | D1 database `syndicate-ledger` | same tenant, production app |

- One Auth0 tenant with separate applications per environment. [inferred: the free plan seems to allow one tenant, but that figure came from
  a partial read of the pricing page]
- Two of D1's 10 free databases are used. Schema changes go through `wrangler d1 migrations` files in `workers/save-api/migrations`,
  applied to preview first. [inferred workflow]
- A GitHub Actions job could deploy the Worker on merge with a Cloudflare API token stored as a repository secret. That needs Guha to
  create the token; nothing secret goes in the repo. [inferred]
- The four public `VITE_*` variables from `docs/CLOUD-SAVE.md` stay; one more, `VITE_PROGRESS_API`, turns the new API on.

### 8.5 Guarding the free limits
- Local-first client: every server failure falls back to what the game does today.
- Event batching (section 7) and an index on `runs(user_id)` and `leads(run_id)`, so no full table scans eat the daily read limit.
- Trim `events` older than 90 days with a Cron Trigger (5 are free per account [verified]).
- Cloudflare emails the account owner when D1 hits its daily limit [verified].

---

## 9. Build order, after the current puzzle work is done

Each step is its own PR; none starts until Guha approves this plan.

1. **Shared next-lead logic**: move "which lead opens next, which links apply" into one module the browser and Worker both import. No behaviour change.
2. **`buildLead` refactor** of `buildRank` (section 3), so the browser can build one lead from the answers the player reached.
3. **Progress tables and `/runs`, `/events`, `/me`** on the existing Worker, plus migrations and tests against a local D1.
4. **`/next` tickets**, with the browser using them when signed in and its own logic when not.
5. **Chief seed pool** job and table.
6. **Optional**: difficulty nudge and side puzzles, once playtests show they help.

Setup Guha would do himself (no step here signs up for anything): create the Auth0 tenant and apps, the Cloudflare D1 databases and a deploy token,
as `docs/CLOUD-SAVE.md` already describes.

## 10. Open questions for review

1. Keep Cloudflare Worker + D1 (recommended) or move to Render + Neon?
2. Should the server be the authority on what opens next when signed in, or only record what the browser chose?
3. Is the difficulty nudge wanted at all, given the approved "no easy path" rules?
4. Chief pool: GitHub Actions or a local run?

## Sources (read 2026-11-28)
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 free tier enforcement (2026-09-01): https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Render free tier: https://render.com/docs/free
- Neon plans: https://neon.com/docs/introduction/plans
- Auth0 pricing: https://auth0.com/pricing (partly read)
