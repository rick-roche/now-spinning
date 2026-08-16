FROM ghcr.io/pnpm/pnpm:11 AS build
RUN pnpm runtime set node 22 -g
# FROM node:22-bookworm AS build
WORKDIR /app
# RUN npm install --global pnpm@11.1.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc* ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -C packages/shared typecheck
RUN pnpm -C apps/web build
RUN pnpm -C apps/server build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/now-spinning.sqlite
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/node_modules ./node_modules
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "apps/server/dist/server.js"]
