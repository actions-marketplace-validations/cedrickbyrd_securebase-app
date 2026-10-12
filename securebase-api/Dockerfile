# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and tsconfig
COPY package*.json tsconfig.json ./

# Install dependencies (ignoring native post-install script crashes)
RUN npm install --ignore-scripts

# Copy backend source files
COPY src ./src

# Compile TypeScript to JavaScript (outputs to dist/server.js)
RUN npm run build

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

USER node

EXPOSE 10000

# Point directly to the compiled JavaScript bundle
CMD ["node", "dist/server.js"]