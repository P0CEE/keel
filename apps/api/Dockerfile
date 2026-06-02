# syntax=docker/dockerfile:1

# Stage 1: prune the monorepo down to just @keel/api and its deps.
FROM oven/bun:1.3.14 AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo prune @keel/api --docker

# Stage 2: install dependencies against the pruned lockfile.
FROM oven/bun:1.3.14 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

# Stage 3: build (copy pruned source on top of installed deps).
FROM oven/bun:1.3.14 AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .

# Stage 4: minimal runtime image.
FROM oven/bun:1.3.14 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/ .
WORKDIR /app/apps/api
USER bun
EXPOSE 3001
CMD ["bun", "src/index.ts"]
