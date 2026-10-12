# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files from securebase-api
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm install

# Copy backend source files
COPY src ./src

# Compile TypeScript to JavaScript (outputs to dist/server.ts)
RUN npm run build

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled dist folder from builder stage
COPY --from=builder /app/dist ./dist

USER node

EXPOSE 10000

CMD ["node", "dist/server.ts"]
