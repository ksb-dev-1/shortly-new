# Shortly — Web

The frontend for Shortly, a URL shortener: a landing page, the full account
flow, and a dashboard for creating links and reading their click analytics.
Next.js App Router with TypeScript.

It talks to the Express API in [`../backend`](../backend), which needs to be
running for anything past the landing page to work.

## Stack

| | |
| --- | --- |
| Framework | Next.js 16, App Router, React 19 |
| Compiler | React Compiler enabled |
| Data | TanStack Query |
| Forms | React Hook Form + Zod |
| UI | shadcn/ui over Radix, Tailwind CSS v4 |
| Animation | Motion |
| Theming | `next-themes`, light and dark |
| Toasts | Sonner |

## Getting started

Start the backend first — see [`../backend/README.md`](../backend/README.md).
Then:

```bash
npm install
cp .env.example .env.local    # points at the API
npm run dev                   # http://localhost:3000
```

### Environment

One variable, documented in `.env.example`:

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Scheme and host only — no `/api/v1`, no trailing slash. Each call appends its
own path. It must match the port the backend is actually listening on, and in
production it has to be an origin the browser will accept cookies from.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the build |
| `npm run lint` | ESLint |

## Structure

```
src/
  app/
    (auth)/        signup, login, verify-email, resend-verification,
                   forgot-password, reset-password
    dashboard/     the links UI — list, create, edit, delete, analytics
    profile/       name, avatar, change password, delete account
    page.tsx       landing page
  components/
    home/          landing page sections
    ui/            shadcn primitives
  lib/             auth context, query provider, API helpers
  validation/      Zod schemas shared across forms
```

Helpers live in the folder of the feature that uses them rather than in a
shared `services/` — `app/dashboard/queries.ts` and `app/dashboard/types.ts`
sit beside the components that read them. Only things genuinely used across
features go up into `lib/`.

## Design notes

The decisions the code doesn't explain on its own.

**The session is `httpOnly` cookies owned by the API origin, and that decides
the data-fetching strategy.** Authed data is fetched client-side, not in Server
Components. This is a consequence rather than a preference: refreshing a
session *sets* cookies, which Next forbids during a Server Component render, and
the cookies belong to the Express origin rather than this one. Server-rendering
authed pages would mean putting a BFF in front — deliberately out of scope.

**Sessions are restored reactively on a 401, not on a timer.** The access token
lasts 15 minutes, so a tab left open longer than that used to show a signed-in
shell over requests that all failed. A renewal timer inside `AuthProvider` was
built first and removed; what ships instead is `refreshSession()` on the auth
context, called when a request actually comes back 401, which then retries.

`refreshSession` keeps its in-flight promise in a ref so simultaneous callers
await the same rotation. That part matters: refresh tokens are single-use, and
two rotations of one token is exactly what the backend reads as theft — it
responds by revoking every session on the account.

**The 401-retry is written out at each call site instead of behind a wrapper.**
An `apiFetch` was introduced once and removed. Keeping `fetch` visible means the
retry is readable where it happens, and the wrapper's convenience was not worth
hiding a control flow this consequential.

**React Compiler is on, and three forms opt out with `"use no memo"`.** React
Hook Form's `register()` hands back a ref callback; when the compiler memoizes
the component the ref can be captured such that the form submits empty after
the first successful submit. Where a form is mounted once and reused —
`create-link-form.tsx`, `change-password-form.tsx` — it needs the escape hatch.
Dialog forms that unmount between opens don't, which is why
`edit-link-dialog.tsx` has a comment saying so rather than the directive.

**Short URLs are built from the API origin, not this one.** The redirect route
is `GET /:code` mounted at the backend's root, so that's where a short link has
to point. In production this is where a dedicated short domain would go; the two
only look interchangeable in development because both are localhost.

**Backend errors arrive in two shapes.** A deliberate `ApiError` sends
`{ message }`, but a failed Zod parse sends `{ errors }` from `z.treeifyError`
with no message at all. Reading only `.message` turned every validation failure
into "Something went wrong", so `errorMessage()` in `lib/api.ts` handles both
and prefers the field-level issue over the form-level one.

**The landing page hero honours `prefers-reduced-motion`.** The four-phase
"machine" animation is replaced by the finished link pairs rotating in place,
and the decorative panel is `aria-hidden` with an `sr-only` description beside
it, since the animation carries no information a screen reader needs.

## Notes

`AGENTS.md` at the root of this folder is generated by `next dev`, not written
by hand. Removing it just re-creates it on the next run.
