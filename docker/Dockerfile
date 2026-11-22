# Empty by default; the personal stack replaces it with data/local via additional_contexts.
FROM scratch AS local

FROM node:24-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
ARG LOCAL_OVERLAY=off
ENV LOCAL_OVERLAY=$LOCAL_OVERLAY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=local . ./data/local/
RUN npx prisma --version && npx prisma generate && npm run build

FROM base AS runner
ARG LOCAL_OVERLAY=off
ENV NODE_ENV=production LOCAL_OVERLAY=$LOCAL_OVERLAY
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/data ./data
COPY --from=build --chown=node:node /app/src/generated ./src/generated
COPY --from=build --chown=node:node /app/prisma.config.ts /app/next.config.ts /app/package.json /app/docker/docker-entrypoint.sh ./
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
