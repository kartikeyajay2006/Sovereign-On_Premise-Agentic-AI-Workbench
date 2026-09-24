# 4.4 · The frontend

The web console is a Next.js 16 App Router application in `frontend/`: about 24,000 lines of TypeScript and React 19, styled with Tailwind CSS 4, with 66 npm packages in total and no runtime dependency on any external service.

## Routes

| Route | Group | Screen |
|---|---|---|
| `/` | `(marketing)` | The public landing page, which plays one recorded run as you scroll |
| `/sign-in` | | Sign-in |
| `/console` | `(app)` | Thread |
| `/skills` | `(app)` | Skills |
| `/harnesses` | `(app)` | Harnesses (`?harness=` to configure one, `?run=` to open a run) |
| `/approvals` | `(app)` | Approvals |
| `/registry` | `(app)` | Knowledge (`#documents`, `#retrieval`, `#models`, `#uploads`) |
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
│   ├── thread/          composer, slash menu, model menu, turns, transcript, usage
│   ├── evidence/        the evidence rail
│   ├── harness/         library, configure, run view, report
│   ├── sandbox/         console, presets, result, self-test
│   └── skills/          skills view
├── components/          screen-level views and app chrome
│   ├── approvals/  audit/  registry/  security/  landing/  sign-in/
│   ├── aegis-logo.tsx   the mark, drawn once for every screen
│   ├── navigation.tsx   sidebar, G-sequences, mobile sheet
│   └── command-palette.tsx, role-switcher.tsx, theme-toggle.tsx, …
├── shared/
│   ├── ui/              controls (button, input, tabs, segmented, kbd) and data display
│   └── motion/          appear, disclose, seal, sweep, trace, measured numbers
├── hooks/use-event-stream.ts
└── lib/                 api.ts, types.ts, presentation.ts, utils.ts
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

`app/globals.css` defines the tokens: warm paper and ink in light, a warm night in dark, and four status colours (sovereign green `#16a34a`, active blue `#0284c7`, approval amber `#d97706`, critical red `#dc2626`). Type is Geist Sans and Geist Mono, with Instrument Serif italic for the occasional emphasised word. The brand gradient (orange, pink, violet) belongs to the mark and the public page; it does not decorate data. See the [brand kit](../../assets/brand/README.md).

## Build

```bash
npm run build     # Turbopack; type-checks; prerenders 13 routes as static
npm run start     # serves the build; add -H 127.0.0.1 to bind to loopback
npm run dev       # hot reload
```

There is no lint script and no frontend test suite yet. `npx tsc --noEmit` is the type check.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 4.3 · Backend modules](03-backend-modules.md) | [↑ 04 · Architecture](README.md) | [4.5 · The data model →](05-data-model.md) |

<!-- nav:end -->
