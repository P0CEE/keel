# @keel/website

The public landing and marketing site for **keel**, a production-grade monorepo starter.

## Stack

- Next.js 16 (App Router, React Compiler)
- `next-international` for i18n
- Tailwind v4 via the shared `@keel/ui` design system
- SEO-first: `robots.ts`, `sitemap.ts` with hreflang alternates, per-locale metadata

## Internationalization

Locales: **en**, **fr** with `urlMappingStrategy: "rewriteDefault"`.

- `/` serves English (default locale, no prefix)
- `/fr` serves French

Locale resolution: a visitor whose browser prefers French gets French;
everyone else gets English. Translations live in `src/locales/{en,fr}.ts`.
The Next.js 16 proxy (`src/proxy.ts`) handles resolution.

## Development

```sh
bun run dev
```

The site runs on [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` to `.env` and set `NEXT_PUBLIC_APP_URL` to the product app URL.

## Scripts

| Script      | Description                 |
| ----------- | --------------------------- |
| `dev`       | Start the dev server (3000) |
| `build`     | Production build            |
| `start`     | Serve the production build  |
| `typecheck` | Type-check with `tsc`       |
| `lint`      | Lint with `oxlint`          |
