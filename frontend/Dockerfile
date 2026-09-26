# The workbench web app: built once, served by `next start` on :3000.
#
# WORKBENCH_API_URL is a build argument, not only a runtime variable: Next
# resolves the /api rewrite in next.config.mjs at build time and writes the
# destination into .next/routes-manifest.json, so a value set only when the
# container starts is never read.

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG WORKBENCH_API_URL=http://127.0.0.1:8000
ENV WORKBENCH_API_URL=${WORKBENCH_API_URL}
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
