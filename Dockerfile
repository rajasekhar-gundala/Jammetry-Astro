# --- Stage 1: Build Stage ---
FROM node:25-alpine AS builder
ENV ASTRO_TELEMETRY_DISABLED=1
WORKDIR /app

# 1. Install pnpm globally
RUN npm install -g pnpm

# 2. Copy dependency files first to leverage Docker caching
# Make sure you have a pnpm-lock.yaml file in your repo!
COPY package.json pnpm-lock.yaml ./

# 3. Install dependencies strictly using the lockfile
RUN pnpm install --frozen-lockfile

# 4. Copy the rest of the source code
COPY . .

# 5. Build the Astro project
RUN pnpm run build

# --- Stage 2: Runtime Stage ---
FROM node:25-alpine AS runtime
ENV ASTRO_TELEMETRY_DISABLED=1
WORKDIR /app

# 6. Copy only the necessary compiled files from the builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 7. Set Environment Variables
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production

EXPOSE 4321

# 8. Start the Astro SSR server
CMD ["node", "./dist/server/entry.mjs"]