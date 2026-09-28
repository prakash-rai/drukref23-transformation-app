FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Public sub-path behind IIS; baked into asset URLs at build time.
ARG APP_BASE_PATH=/drukref/
ENV APP_BASE_PATH=${APP_BASE_PATH}
# Unit tests gate the image; documentation checks (tests/) run in `pnpm check` on the full repository.
RUN pnpm vitest run --exclude 'tests/**' && pnpm build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000

RUN useradd --system --uid 10001 appuser
COPY --from=build --chown=appuser:appuser /app/.output ./.output

USER appuser
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
