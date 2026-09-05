# Shortly — API

[![CI](https://github.com/ksb-dev-1/shortly-new/actions/workflows/ci.yml/badge.svg)](https://github.com/ksb-dev-1/shortly-new/actions/workflows/ci.yml)

The backend for Shortly, a URL shortener: accounts with verified email, short
links, and per-link click analytics. Express 5 and TypeScript over Postgres,
with no ORM — every query is SQL.

The frontend that consumes this lives in [`../frontend`](../frontend).

## Stack

| | |
| --- | --- |
| Runtime | Node.js, ES modules, TypeScript |
| HTTP | Express 5 |
| Database | Postgres (developed against [Neon](https://neon.tech)), `pg` — no ORM |
| Auth | JWT access token + opaque refresh token, both in `httpOnly` cookies |
| Validation | Zod, applied as route middleware |
| Email | [Resend](https://resend.com), templates written in React Email |
| Uploads | Multer into memory, then Cloudinary |
| Rate limiting | `express-rate-limit` |

## Getting started

You need Node.js 20.6 or newer — the `--env-file` flag the `start` script relies
on landed in 20.6 — and a Postgres database. Neon's free tier is enough, and is
what this was built against.

```bash
npm install
cp .env.example .env    # then fill it in — see below
npm run migrate         # creates the tables
npm run dev             # http://localhost:5000
```

`npm run dev` uses `tsx watch`, so it restarts on save.

### Environment

Copy `.env.example` to `.env` and work through it — every variable is
documented there. The server validates on boot and throws naming the first one
it can't find, so a missing value fails immediately rather than at the first
request that needs it.

Three of them need an account somewhere: `DATABASE_URL` (Neon or any Postgres),
`RESEND_API_KEY` (for verification and password-reset mail), and the three
`CLOUDINARY_*` values (for avatars). Resend's `onboarding@resend.dev` sender
works for local development without a verified domain — it only delivers to the
address that owns the Resend account, which is fine when you're the only user.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Watch mode on `src/server.ts` |
| `npm run build` | `tsc` to `dist/`, via `tsconfig.build.json` so the tests aren't emitted |
| `npm start` | Run the built output |
| `npm run migrate` | Apply pending files in `src/db/migrations`; safe to re-run |
| `npm run cleanup` | Delete token rows a week past expiry |
| `npm run format` | Prettier over `src` |
| `npm test` | The test suite, once |
| `npm run test:watch` | The test suite, on every save |
| `npm run test:db:up` | Start the test database |
| `npm run test:db:down` | Stop and delete the test database |

`npm run cleanup` is meant to run on a schedule in production. It's a separate
entry point rather than an in-process timer so the hosting platform owns the
scheduling.

## Testing

Sixteen files under [`src/test`](src/test) cover every endpoint, the
`requireAuth` middleware and the rate limiters. They're integration tests: a real Express app driven
through Supertest, against a real Postgres. Nothing about the database is
mocked, because most of what's worth testing here *is* the SQL — the cascade
that empties five tables, the unique violation behind a duplicate email, the
`FOR UPDATE` that serialises the email throttle. Only Resend and Cloudinary are
replaced, and only because reaching them would mean sending real mail and
storing real files.

You need **Docker** installed and running, in addition to the Node version
above. The suite talks to a throwaway container, never to your Neon database.

```bash
npm run test:db:up     # start Postgres on port 5433, wait until it answers
npm test               # run everything once
npm run test:db:down   # when you're done
```

Leave the container running between runs — starting it is the slow part. It
holds nothing you need to keep.

The same suite runs on every push and pull request, alongside a typecheck and a
build: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). CI gets its
database from a `postgres:17-alpine` service mapped to the same port 5433, so
`.env.test` is used there exactly as it is here, with no CI-specific variant to
keep in step.

**Where the configuration lives.** `docker-compose.test.yml` defines the
container: `postgres:17-alpine` on host port **5433**, not 5432, so a natively
installed Postgres can't collide with it, and with no volume, so its data dies
with it. `.env.test` is committed — it holds no real credentials, only dummy
values that exist to satisfy the checks in `config/env.ts`, and without it in
the repo a fresh clone couldn't run the suite at all.

`vitest.config.ts` loads `.env.test` and nothing else, using Node's own
env-file loader rather than reading `.env` as a fallback, so a variable missing
from the test file fails loudly instead of silently picking up a real value. It
then refuses to start unless `DATABASE_URL` names `localhost:5433` — the suite
truncates tables before every test, and that guard is what stands between a
mistyped variable and deleting real data.

`src/test/setup.ts` applies the real migrations from `src/db/migrations` once
per file, so the tables under test can't drift from the ones in production, then runs
`TRUNCATE users RESTART IDENTITY CASCADE` before each test. Emptying `users` is
enough to empty all six tables, because every child cascades from it. Files run
one at a time (`fileParallelism: false`): they share the single container, and a
file truncating tables while another was mid-run would fail at random.

**Two things behave differently under test**, both keyed off `NODE_ENV=test`:

- **The rate limiters are skipped.** Their counters are per-process and
  in-memory, so a file with six signups was being throttled by the fifth. The
  one exception is `rate-limits.test.ts`, which switches them back on around
  the requests it measures — being throttled is the expected outcome there.
- **bcrypt drops from 12 salt rounds to 4.** Hashing dominated the runtime and
  nothing under test depends on the cost. Production keeps 12.

Table creation itself is a real migration (see [Data model](#data-model)), run
against the test database the same way as production: `beforeAll` in
`test/setup.ts` calls the same `applyMigrations` that `npm run migrate` does,
so a schema change only ever needs a new migration file — the already-running
container picks it up on the next test run without being recycled.

## API

Everything is under `/api/v1` except the redirect, which is deliberately at the
root — the whole point is a short URL.

Authentication is by cookie, not by an `Authorization` header. The access token
lasts 15 minutes and the refresh token 7 days; both are set `httpOnly`, so
browser JavaScript can't read either one.

### Auth — `/api/v1/auth`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/signup` | — | Create an account, send a verification email |
| `POST` | `/verify-email` | — | Spend a verification token |
| `POST` | `/resend-verification` | — | Send a fresh verification email |
| `POST` | `/login` | — | Set both cookies |
| `POST` | `/refresh` | refresh cookie | Rotate the refresh token, reissue the access token |
| `POST` | `/logout` | refresh cookie | Revoke the stored token, clear both cookies |
| `POST` | `/forgot-password` | — | Email a reset link |
| `POST` | `/reset-password` | — | Spend a reset token, set a new password |
| `POST` | `/change-password` | access cookie | Change it while signed in |

### Profile — `/api/v1/profile`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | ✓ | The signed-in user |
| `PATCH` | `/` | ✓ | Update name and/or avatar (`multipart/form-data`, field `image`) |
| `DELETE` | `/` | ✓ | Delete the account; current password in the JSON body |

Avatars are capped at 5MB and must be JPEG, PNG or WebP. They're uploaded to
memory rather than disk, then streamed to Cloudinary — nothing touches the
filesystem, which matters on hosts with an ephemeral one.

### Links — `/api/v1/links`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | ✓ | The user's links, paginated by `?page=` |
| `POST` | `/` | ✓ | Create one, with an optional custom alias |
| `PATCH` | `/:id` | ✓ | Update the destination or the code |
| `DELETE` | `/:id` | ✓ | Delete it and its clicks |
| `GET` | `/:id/analytics` | ✓ | Totals plus a 30-day daily series |

### Redirect

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/:code` | — | Record the click, redirect to the destination |

## Data model

Six tables, defined across numbered, forward-only files in
[`src/db/migrations`](src/db/migrations) — `0001_init.sql` is all six; later
changes each get their own file. `npm run migrate` applies whatever a
`schema_migrations` table says hasn't run yet, in filename order, each in its
own transaction. Nothing here is ever edited after landing on `main`; a
correction is a new migration, the same way you wouldn't rewrite a shipped
commit.

```
users ─┬─ links ─── link_clicks
       ├─ refresh_tokens
       ├─ email_verification_tokens
       └─ password_reset_tokens
```

Every child references `users(id)` with `ON DELETE CASCADE`, so deleting an
account is one `DELETE FROM users` and the database handles the rest.

Clicks are stored **one row per redirect** rather than as a counter on `links`.
A counter answers "how many" and nothing else; when, from where and on what all
need the individual events, and the total can always be derived back out. The
raw `user_agent` is kept unparsed so browser and device stay backfillable for
clicks already recorded. No IP is stored, which is also why country never will
be.

## Design notes

The parts worth explaining, because the code alone doesn't say why.

**Two tokens, only one of them a JWT.** The access token is a signed JWT and is
never stored — that's the point of it. The refresh token is opaque random bytes,
and only its SHA-256 hash goes in the database, so a leaked dump doesn't hand
anyone a session. This is why there's no `REFRESH_TOKEN_SECRET`: there's nothing
to sign.

**Rotation with reuse detection.** Every refresh spends the old token and issues
a new one. Presenting a token that's already been spent means it leaked, since
the legitimate holder has moved on to the replacement — so that case revokes
every session on the account rather than just failing the request.

**A wrong password answers 403, never 401.** `401` already means "access token
expired", and the frontend answers that by rotating the refresh token and
retrying. If a bad password also returned 401, a typo would burn a rotation and
cost two attempts against the rate limiter. Any endpoint that re-checks a
password follows this rule.

**Changing a password revokes every session, including the caller's, then
issues a replacement.** Not "revoke the others" — the refresh cookie is scoped
to `path=/api/v1/auth/refresh` and never reaches the change-password endpoint,
so the server can't tell which stored row belongs to the caller. Other devices
keep working for up to 15 minutes, which is the access token's lifetime;
revoking a refresh token can't recall an access token already issued.

**Rate limiting is layered, and tuned per endpoint rather than globally.**

| Endpoint | Window | Limit | Keyed on |
| --- | --- | --- | --- |
| Signup | 1 hour | 5 | IP |
| Email-sending routes | 1 hour | 3 | IP |
| Token submission | 1 hour | 10 | IP |
| Login | 15 min | 10 | IP |
| Refresh | 15 min | 30 | IP |
| Change password / delete account | 15 min | 10 | IP |
| Link creation | 1 hour | 60 | user |
| Redirect | 15 min | 100 | IP, **misses only** |

Two of those are deliberate. Link creation keys on the user rather than the IP,
which is why its limiter runs *after* `requireAuth` — that's what populates
`req.userId`. And the redirect limiter counts only misses, so a real visitor
following links never builds a tally, while someone enumerating codes does. The
exemption is narrower than it sounds, though: the limiter runs before the route,
so once an address has crossed the line every request from it is refused, valid
codes included. The email routes
also apply a per-recipient limit inside the controller, with `FOR UPDATE`, so
the IP limit isn't the only thing standing between one address and a mailbox
full of verification mail.

**Custom aliases and generated codes share one column.** Both have to be unique
against each other, so two columns couldn't express the constraint. `UNIQUE`
also builds the index the redirect looks codes up by. Comparison is
case-sensitive: `/Sale` and `/sale` are different links, and the generated
base62 codes need the upper and lower halves to differ.

**Route order matters in `app.ts`.** `/:code` matches any single path segment,
so it's registered last — before the API routers it would swallow `/api` itself.

## Deployment

`NODE_ENV=production` is what puts the `Secure` flag on the session cookies.
`TRUST_PROXY` must match the number of proxies in front of the app: rate
limiting keys on `req.ip`, and behind an unacknowledged proxy every request
looks like it came from the proxy, turning per-IP limits into one global limit.

One thing to get right before the first deploy: the cookies are `SameSite=Lax`.
If the API and the frontend end up on **different** registrable domains — say
`*.vercel.app` and `*.onrender.com` — every API call is cross-site, `Lax`
withholds the cookies, and the browser won't even store what login sets. That
needs `SameSite=None` with `Secure`. Hosting both under one domain
(`shortly.com` and `api.shortly.com`) keeps them same-site, so `Lax` continues
to work unchanged and the browser keeps doing the first layer of CSRF defence.
The second option is preferable.

Also check that nothing in front of the app rewrites path prefixes: the refresh
cookie is scoped to `path=/api/v1/auth/refresh`, and if the browser's request
path stops matching, refresh silently stops working while everything else looks
healthy.
