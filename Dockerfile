# CloudGrid runs on Bun with no runtime dependencies (server/ is pure Bun stdlib,
# TypeScript executed directly). The official Bun image is all we need — no build
# step, no npm/node. Railway injects PORT; GOVEE_HOST=0.0.0.0 is set as a service
# variable so the server binds publicly instead of loopback.
FROM oven/bun:1

WORKDIR /app
COPY . .

# Documented default port; Railway overrides via the PORT env var.
EXPOSE 8787

CMD ["bun", "server/index.ts"]
