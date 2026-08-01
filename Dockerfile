FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY index.js ./
COPY gladys-assistant-integration.json ./
COPY src ./src

ENV NODE_ENV=production

CMD ["node", "index.js"]
