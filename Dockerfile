FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: skip the `prepare` build hook here (src/tsconfig aren't
# copied yet); we run the build explicitly below once sources are present.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# WalletConnect project id is baked into the swap UI at build time. Pass with
# `docker build --build-arg WC_PROJECT_ID=...`. Without it, the UI builds but
# the wallet connect step won't work until rebuilt with a real id.
ARG WC_PROJECT_ID=""
ENV WC_PROJECT_ID=$WC_PROJECT_ID
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist

EXPOSE 8080

# The CLI defaults to stdio transport; force HTTP for the container deployment.
ENV MCP_TRANSPORT=http

ENTRYPOINT ["node", "dist/index.js"]
