# Multi-stage build for Google Cloud Run API
# Stage 1: Build
FROM node:24-alpine@sha256:c921b97d4b74f51744057454b306b418cf693865e73b8100559189605f6955b8 AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:24-alpine@sha256:c921b97d4b74f51744057454b306b418cf693865e73b8100559189605f6955b8

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy public directory (static files)
COPY public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start the application
CMD ["node", "dist/index.js"]
