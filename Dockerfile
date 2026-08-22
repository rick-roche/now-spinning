FROM node:22-bookworm AS build
RUN npm install --global pnpm@11.1.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc* ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm --filter @repo/server deploy --prod /prod

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/now-spinning.sqlite
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "apps/server/dist/server.js"]
