FROM node:24-alpine AS base
RUN apk add --no-cache python3 make g++

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=deps /app/node_modules ./node_modules

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/app/data/dongbang.db
# 시간대 고정. 컨테이너 기본값(UTC)이면 서버가 계산/포맷하는 주 시작·시각이
# 한국 사용자 브라우저와 9시간 어긋나 현재시각 라인이 사라지고 예약 시각이
# 잘못 표시된다. (Node 내장 ICU가 해석하므로 tzdata 패키지는 불필요)
ENV TZ=Asia/Seoul

# 시작 시 마이그레이션 + 시드 후 서버 기동
CMD ["sh", "-c", "node --import tsx src/lib/db/migrate.ts && node server.js"]
