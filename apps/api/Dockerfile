FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci
COPY apps/api/ ./apps/api/
COPY packages/shared-types/ ./packages/shared-types/
WORKDIR /app/apps/api
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./
# Regenerate client on Alpine so query engine matches linux-musl-openssl-3.0.x at runtime
RUN npx prisma generate --schema=prisma/schema.prisma
EXPOSE 3001
CMD ["node", "dist/main"]
