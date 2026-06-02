# syntax=docker/dockerfile:1

# --- Prune: isolate @keel/worker and its workspace dependencies ---
FROM oven/bun:1.3.14 AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo prune @keel/worker --docker

# --- Install: restore dependencies from the pruned lockfile ---
FROM oven/bun:1.3.14 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

# --- Runner: minimal production image. The worker runs TypeScript directly
#     via Bun, so there is no build step. ---
FROM oven/bun:1.3.14 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/worker
USER bun
EXPOSE 8080
CMD ["bun", "src/index.ts"]
