FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
RUN npm ci --workspace=packages/server

FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY packages/server ./packages/server
COPY package.json package-lock.json ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
