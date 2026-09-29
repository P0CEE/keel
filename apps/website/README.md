# @keel/website

The public site for **Ramnn**. For now a placeholder page (the mark, the
promise, the way into the app) until the real landing is designed.

## Stack

- Next.js 16 (App Router, React Compiler)
- `next-international` for i18n
- The Mint tokens and reset from `@keel/ui`, CSS Modules
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
