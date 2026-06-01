# mcp-server-across

An MCP (Model Context Protocol) server that indexes [Across Protocol documentation](https://docs.across.to) and provides AI-powered tools for building crosschain applications.

Connect to the **hosted server at `mcp.across.to/mcp`** or run it locally — then use it with **Claude Desktop**, **Claude Code**, **Cursor**, **Codex**, **Windsurf**, or any MCP-compatible client to get instant access to Across Protocol docs, API references, code examples, and live bridge fee queries — all without leaving your editor.

## What It Does

This server is a full MCP citizen for Across Protocol: tools, resources, and prompts.

### Tools

**Docs:**

| Tool | Description |
|------|-------------|
| `search_across_docs` | TF-IDF search across indexed Across docs |
| `get_page` | Fetch the full content of a doc page |
| `get_code_examples` | SDK and integration code examples by topic |
| `recrawl_docs` | Kick off a non-blocking background re-crawl |

**Live REST API (mainnet + testnet):**

| Tool | Description |
|------|-------------|
| `get_supported_chains` | List supported mainnet/testnet chains |
| `get_api_reference` | Across REST API endpoint catalog |
| `get_suggested_fees` | Live fee quote for a bridge transfer |
| `get_swap_quote` | **Returns ready-to-sign calldata** for a crosschain swap |
| `track_deposit` | Look up the lifecycle state of a deposit |
| `list_deposits` | List recent deposits for an address |
| `get_available_routes` | Discover supported (origin, dest, token) routes |
| `get_limits` | Get min/max transferrable for a route |

All action tools return structured content (typed JSON) in addition to a human-readable text payload.

**Interactive (MCP Apps — Claude web & other UI-capable clients):**

| Tool | Description |
|------|-------------|
| `swap_with_wallet` | Opens an **interactive swap view inside the conversation**. Fetches a live Across quote, shows route/fees with a mandatory verify-before-sign step and a quote-expiry countdown, connects the user's wallet via **WalletConnect**, has the user sign the approval + deposit in their own wallet, then tracks fill status live. |

> **The server never holds keys or signs anything.** Every transaction is signed client-side by the user's own wallet, inside the sandboxed iframe. This follows the same model as other production crypto MCP servers.

This tool is built with [MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) (`@modelcontextprotocol/ext-apps`). The UI is bundled into a single HTML resource (`ui://across/swap.html`) and rendered by the host in a sandboxed iframe.

### Environment variables

Both are **public client identifiers** (the integrator ID rides in API query params; the WalletConnect project ID ships inside the browser bundle), so the repo includes working defaults. Override them only if you want your own.

| Variable | Affects | Notes |
|----------|---------|-------|
| `ACROSS_INTEGRATOR_ID` | `get_swap_quote`, `swap_with_wallet` | 2-byte hex integrator ID mandated by the Across Swap API for mainnet. Read at runtime; defaults to `0x00a8`. |
| `WC_PROJECT_ID` | `swap_with_wallet` UI | WalletConnect/Reown project id, **baked into the UI at build time** (`WC_PROJECT_ID=… npm run build`, or `docker build --build-arg WC_PROJECT_ID=…`). Has a default. The sandboxed iframe can't use an injected wallet, so WalletConnect is required. |

### Resources

Every cached doc page is exposed as an MCP resource under `across://docs/{path}`. Plus:

- `across://reference/chains` — supported chains as JSON
- `across://reference/api` — REST API endpoint catalog as JSON

### Prompts

- `build_crosschain_swap` — guided workflow that confirms route + limits, then produces signable calldata
- `diagnose_deposit` — looks up a deposit and recommends a next action

## Hosted Server (No Setup Required)

A production instance of this server is hosted at **`https://mcp.across.to/mcp`** using Streamable HTTP transport. You can connect any MCP-compatible client directly — no cloning, building, or running anything locally.

### Claude Desktop

Edit your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "across-docs": {
      "url": "https://mcp.across.to/mcp"
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add --transport http across-docs https://mcp.across.to/mcp
```

Or add to `.mcp.json`:

```json
{
  "mcpServers": {
    "across-docs": {
      "url": "https://mcp.across.to/mcp"
    }
  }
}
```

### Cursor

Create or edit `.cursor/mcp.json` in your project root (or your global Cursor MCP config):

```json
{
  "mcpServers": {
    "across-docs": {
      "url": "https://mcp.across.to/mcp"
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/settings.json`:

```json
{
  "mcp": {
    "servers": {
      "across-docs": {
        "url": "https://mcp.across.to/mcp"
      }
    }
  }
}
```

### Codex (OpenAI CLI)

```json
{
  "mcpServers": {
    "across-docs": {
      "url": "https://mcp.across.to/mcp"
    }
  }
}
```

### Windsurf

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "across-docs": {
      "url": "https://mcp.across.to/mcp"
    }
  }
}
```

---

## Quick Start (Self-Hosted)

### Prerequisites

- Node.js >= 18
- npm

### Install & Build

```bash
git clone https://github.com/your-username/mcp-server-across.git
cd mcp-server-across
npm install
npm run build
```

The first time the server runs, it will crawl docs.across.to and cache everything locally to `~/.across-mcp/cache.json`. Subsequent starts load from cache instantly and re-crawl in the background every 24 hours.

### Run without cloning (npx)

Once published, you can run the server with no local checkout — point any stdio client at:

```json
{
  "mcpServers": {
    "across-docs": {
      "command": "npx",
      "args": ["-y", "mcp-server-across"]
    }
  }
}
```

### Transport modes

The server speaks two transports from the same entrypoint:

- **stdio (default)** — used when launched as a local child process (the `command`/`args` configs below, `npx`, or `claude mcp add`). This is what local clients expect.
- **Streamable HTTP** — opt in with `--http`, `MCP_TRANSPORT=http`, or by setting `PORT`. This powers the hosted instance at `https://mcp.across.to/mcp` and serves `/mcp` plus a `/health` check.

---

## Setup by Client (Self-Hosted)

### Claude Desktop

Edit your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "across-docs": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-across/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You'll see the Across tools appear in the tool picker.

### Claude Code (CLI)

Add to your project's `.mcp.json` or global Claude Code settings:

```json
{
  "mcpServers": {
    "across-docs": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-across/dist/index.js"]
    }
  }
}
```

Or run directly:

```bash
claude mcp add across-docs node /absolute/path/to/mcp-server-across/dist/index.js
```

### Cursor

Create or edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "across-docs": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-across/dist/index.js"]
    }
  }
}
```

Restart Cursor. The tools will be available in Cursor's AI chat.

### VS Code (Copilot)

Add to your VS Code settings (`.vscode/settings.json`):

```json
{
  "mcp": {
    "servers": {
      "across-docs": {
        "command": "node",
        "args": ["/absolute/path/to/mcp-server-across/dist/index.js"]
      }
    }
  }
}
```

### Codex (OpenAI CLI)

Add to your Codex MCP config:

```json
{
  "mcpServers": {
    "across-docs": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-across/dist/index.js"]
    }
  }
}
```

### Windsurf

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "across-docs": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-across/dist/index.js"]
    }
  }
}
```

---

## Usage Examples

Once connected, you can ask your AI assistant things like:

- *"Search the Across docs for how to do a crosschain swap"*
- *"Show me the Across API endpoint for suggested fees"*
- *"What chains does Across Protocol support?"*
- *"Get me code examples for using the Across SDK"*
- *"What are the bridge fees to send USDC from Ethereum to Arbitrum?"*
- *"How do I run an Across relayer?"*
- *"Show me the full page on ERC-7683 intents"*

The AI will use the MCP tools to fetch accurate, up-to-date information from the indexed documentation.

---

## Deployment

### Local (Recommended for Personal Use)

Just build and point your MCP client to the `dist/index.js` — that's it. The server runs as a local stdio process.

```bash
npm run build
# Configure your client as shown above
```

### Docker

The image runs in **HTTP mode** by default (it sets `MCP_TRANSPORT=http` and exposes port 8080) — this is the hosted-deployment shape.

```bash
# Build the image
docker build -t mcp-server-across .

# Run the HTTP server (Streamable HTTP at /mcp, health at /health)
docker run -p 8080:8080 mcp-server-across
```

To run the container in **stdio mode** instead (for Docker-aware MCP clients that launch it as a child process), override the transport env:

```json
{
  "mcpServers": {
    "across-docs": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "MCP_TRANSPORT=stdio", "mcp-server-across"]
    }
  }
}
```

To persist the cache across container restarts:

```bash
docker run -p 8080:8080 -v across-mcp-cache:/root/.across-mcp mcp-server-across
```

### Cloud Deployment (Railway / Fly.io / AWS)

For remote deployment, the server runs in Streamable HTTP mode (set automatically in the Docker image, or via `MCP_TRANSPORT=http`/`PORT`) and serves `/mcp` directly — no proxy needed. You can deploy to any cloud provider:

**Railway:**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Deploy
railway init
railway up
```

**Fly.io:**
```bash
fly launch
fly deploy
```

**AWS/GCP/Azure:** Deploy the Docker image to your container service of choice (ECS, Cloud Run, Container Apps).

> Note: Remote/hosted deployments use Streamable HTTP transport (the `/mcp` endpoint). Local clients launch the server over stdio. Both are served by the same entrypoint — see [Transport modes](#transport-modes).

### npm Global Install

You can also install it globally:

```bash
npm install -g .
# Then use:
mcp-server-across
```

---

## Architecture

```
src/
├── index.ts          # Entry point — stdio transport + background crawling
├── server.ts         # MCP server with all 7 tool registrations
├── crawler.ts        # Fetches & parses docs.across.to pages (cheerio)
├── store.ts          # In-memory doc store + JSON disk cache
├── search.ts         # TF-IDF text search engine
└── data/
    └── known-urls.ts # All known doc URLs + chain data + API endpoints
```

**How it works:**

1. On startup, loads cached docs from `~/.across-mcp/cache.json`
2. If cache is stale (>24h) or missing, crawls docs.across.to in the background
3. Builds a TF-IDF search index over all documentation
4. Exposes 7 tools via the MCP protocol
5. Re-crawls every 24 hours to stay up to date

**Dependencies are minimal:**
- `@modelcontextprotocol/sdk` — MCP protocol
- `htmlparser2` + `domutils` + `dom-serializer` — HTML parsing
- `zod` — Schema validation

---

## Development

```bash
# Watch mode for development
npm run dev

# Build
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

The MCP Inspector gives you a UI to test each tool interactively.

---

## Covered Documentation

The server indexes the following sections from docs.across.to:

- **Overview** — What is Across Protocol, introduction
- **Developer Quickstart** — Crosschain swap integration, ERC-7683, embedded actions
- **Concepts** — Crosschain intents, intent lifecycle
- **API Reference** — All REST API endpoints (fees, routes, deposits, swaps)
- **SDK Reference** — @across-protocol/app-sdk usage
- **Supported Chains** — 22+ mainnet chains, 8 testnet chains
- **Token Addresses** — Contract addresses for supported tokens
- **Relayers** — Running and nominating relayers
- **Resources** — Support links, audits, bug bounty

---

## License

MIT
