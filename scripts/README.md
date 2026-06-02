# scripts/

Repo maintenance scripts, run through root `package.json` entries.

| Script     | Command         | Does                                                                                 |
| ---------- | --------------- | ------------------------------------------------------------------------------------ |
| `clean.ts` | `bun run clean` | Removes build output and caches. `bun run clean -- --all` also wipes `node_modules`. |

Each app and package owns its own `.env` (Turborepo convention — there is no
root `.env`). Copy each `.env.example` to `.env` in the same directory;
`packages/db` has its own `.env` for `drizzle-kit`.
