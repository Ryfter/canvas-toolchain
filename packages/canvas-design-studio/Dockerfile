# Stage 1: Build TypeScript
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

# Stage 2: Production image
FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder /app/dist ./dist/

# Institution config is mounted from the host at runtime:
#   -v ~/.canvas-design-mcp:/root/.canvas-design-mcp
# Run the setup wizard on your host first: npx canvas-toolchain-design-studio

ENTRYPOINT ["node", "dist/index.js"]
