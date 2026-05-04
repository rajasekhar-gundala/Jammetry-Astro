# Stage 1: Base setup with pnpm
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV ASTRO_TELEMETRY_DISABLED=1
# Enable corepack to use pnpm without installing it globally
RUN corepack enable

# Stage 2: Install ONLY production dependencies
FROM base AS prod-deps
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml* ./
# Use Docker build cache to speed up pnpm installs
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Stage 3: Build the application
FROM base AS builder
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml* ./
# Install ALL dependencies (including devDependencies like Tailwind, Astro, etc.) needed for the build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Stage 4: Production runner
FROM base AS runner
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1

# Set production environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Copy only the necessary files from previous stages
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Expose the port Astro runs on
EXPOSE 4321

# Start the Node server (Astro's default output path for the Node adapter)
CMD ["node", "./dist/server/entry.mjs"]