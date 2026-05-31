# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.js ./
COPY controllers ./controllers
COPY middleware ./middleware
COPY routes ./routes
COPY scripts ./scripts
COPY services ./services
COPY utils ./utils

RUN mkdir -p data uploads && chown -R nodeapp:nodeapp /app

USER nodeapp
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health >/dev/null || exit 1
CMD ["npm", "start"]
