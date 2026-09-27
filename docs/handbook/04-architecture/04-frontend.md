# 4.4 · The frontend

The web console is a Next.js 16 App Router application in `frontend/`: about 33,600 lines of TypeScript and React 19, styled with Tailwind CSS 4, with 50 npm packages installed and no runtime dependency on any external service.

## Routes

| Route | Group | Screen |
|---|---|---|
| `/` | `(marketing)` | The public landing page, which plays one recorded run as you scroll |
| `/sign-in` | | Sign-in, identifier first |
| `/setup` | | Owner setup: the first account on a new host |
| `/invite` | | Accept an invitation |
| `/request-access` | | Ask an administrator for an account |
| `/reset` | | Reset a password |
| `/console` | `(app)` | Thread |
| `/skills` | `(app)` | Skills |
| `/harnesses` | `(app)` | Harnesses (`?harness=` to configure one, `?run=` to open Harness Control) |
| `/approvals` | `(app)` | Approvals |
| `/registry` | `(app)` | Knowledge (`#documents`, `#retrieval`, `#models`, `#uploads`) |
| `/measurements` | `(app)` | Measurements: every figure, with the artifact it came from |
| `/proof` | `(app)` | Proof Mode for one run (`?run=`) |
| `/compare` | `(app)` | Two runs side by side (`?a=` and `?b=`) |
| `/admin/access` | `(app)` | People: access requests, invitations and accounts (needs `users.manage`) |
| `/security` | `(app)` | Assurance · Posture |
| `/sandbox` | `(app)` | Assurance · Sandbox |
| `/audit` | `(app)` | Assurance · Audit |

Old addresses redirect: `/ask`, `/tasks`, `/history` and `/workspace` → `/console`; `/knowledge` and `/library` → `/registry`; `/record` → `/audit`.

The `(app)` group's layout wraps every screen in the auth guard (which checks the session and shows *Checking your session…* while it does), the navigation and the providers.

## Source layout

```text
frontend/
├── app/                 routes, layouts, global CSS, fonts, favicon
├── features/            self-contained product areas
│   ├── thread/          composer, slash menu, model menu, turns, transcript, held block, usage
│   ├── evidence/        the evidence rail
│   ├── harness/         library, configure, Harness Control, report
│   ├── sandbox/         console, presets, result, self-test
│   ├── skills/          skills view
│   ├── measurements/    the measurements ledger
│   ├── proof/           Proof Mode
│   └── compare/         two runs side by side
├── components/          screen-level views and app chrome
│   ├── accounts/  approvals/  audit/  evidence/  landing/  pid/  registry/  security/  sign-in/
│   ├── aegis-logo.tsx   the lock mark, drawn once for every screen
│   ├── navigation.tsx   sidebar, G-sequences, mobile sheet
│   └── command-palette.tsx, role-switcher.tsx, theme-toggle.tsx, …
├── shared/
│   ├── ui/              controls (button, tabs, segmented, kbd) and data display
│   └── motion/          append, disclose, light, seal, sweep, trace, measured numbers
├── hooks/use-event-stream.ts
└── lib/                 api.ts, types.ts, presentation.ts, crew.ts, utils.ts
```

## Talking to the API

`lib/api.ts` wraps `fetch` for every endpoint. It keeps the session token in `sessionStorage` and `localStorage` and adds `Authorization: Bearer …` to each call. All calls go to the page's own origin under `/api/`, and Next.js rewrites them to `WORKBENCH_API_URL`:

```js
// next.config.mjs
async rewrites() {
  const target = process.env.WORKBENCH_API_URL ?? 'http://127.0.0.1:8000'
  return [{ source: '/api/:path*', destination: `${target}/api/:path*` }]
}
```

The proxy timeout is raised to one hour (`experimental.proxyTimeout`), because a run's event stream and a long CPU inference outlast Next's default 30 seconds.

`lib/types.ts` mirrors the backend's schemas. `lib/presentation.ts` holds display data: the demo accounts, starter prompts, deliverable formats and sandbox mechanism names.

## The live stream

`hooks/use-event-stream.ts` opens an `EventSource` on `/api/events` (optionally `?task_id=…`) with credentials, so the session cookie authenticates it. It calls the consumer's `onEvent` for each message and re-renders only when the connection opens or drops.

That restraint matters for correctness. The server drops events for a subscriber whose queue (256 events) is full, rather than stalling the agent. A tab that re-rendered on every token would fall behind and silently lose stage and evidence events.

## Security headers

Every response carries:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data:; font-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` |
| `Referrer-Policy` | `no-referrer` |
| `X-Content-Type-Options` | `nosniff` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`'unsafe-inline'` is there because Next streams its styles and its server-component payload as inline elements without a nonce. It permits inline code from this document only, and nothing over the network. `'unsafe-eval'` is added only in development, for hot reload.

## Design system

The look is Hi-Vis Monochrome. `app/globals.css` defines the tokens: a neutral night (`#070707`) by default and paper (`#faf9f6`) one click away, square 2px corners, four status colours (sovereign green `#16a34a`, active blue `#0284c7`, approval amber `#d97706`, critical red `#dc2626`, with text variants recomputed for contrast on night), and one accent, lime `#d4f24a`, which means "you can act" or "this is cited". Type is Archivo (variable weight and width) with Martian Mono for labels, ids and hashes; Geist stays as the fallback, and Instrument Serif sets one italic word on the empty thread. `app/hv-motion.css` holds Harness Control's motion and `app/(marketing)/landing.css` the public page.

## Build

```bash
npm run build     # Turbopack; type-checks; prerenders 20 routes as static
npm run start     # serves the build; add -H 127.0.0.1 to bind to loopback
npm run dev       # hot reload
```

There is no lint script. `npx tsc --noEmit` is the type check (the smoke tests have their own, `-p tsconfig.e2e.json`, so a build never needs `@playwright/test`), `npm run test:e2e` runs the Playwright smoke tests against a mocked API, and `scripts/ui_check.py` opens every page against the live backend ([13.2](../13-development/02-testing.md)).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 4.3 · Backend modules](03-backend-modules.md) | [↑ 04 · Architecture](README.md) | [4.5 · The data model →](05-data-model.md) |

<!-- nav:end -->
