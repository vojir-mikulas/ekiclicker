# =========================================================================
# Eki Clicker — multi-stage build.
#   1) build  — nainstaluje workspaces a zbuilduje web (Vite → apps/web/dist)
#   2) runtime — jen prod závislosti + server + zbuildovaný web; spustí Node,
#                který servíruje statiku i /api a při startu pustí migrace.
# (pg je čisté JS → není potřeba nativní toolchain, stačí slim image.)
# =========================================================================

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# nejdřív jen manifesty kvůli cache vrstvě npm ci
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .
RUN npm run build -w @ekiclicker/web

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev
# zdroje serveru + sdíleného balíčku (bez build kroku) + zbuildovaný web
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY apps/server/migrations apps/server/migrations
COPY --from=build /app/apps/web/dist apps/web/dist
ENV PORT=3000
ENV WEB_DIST=/app/apps/web/dist
EXPOSE 3000
CMD ["node", "apps/server/src/index.js"]
