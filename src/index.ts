#!/usr/bin/env node

import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DocStore } from "./store.js";
import { SearchEngine } from "./search.js";
import { crawlDocs } from "./crawler.js";
import { createServer as createMcpServer, type ServerDeps } from "./server.js";

const RECRAWL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// IMPORTANT: every log in this process MUST go to stderr (console.error).
// In stdio mode, stdout carries the JSON-RPC stream — a stray console.log
// would corrupt the protocol and break the connection.

/**
 * Shared setup used by both transports: doc store, search index, and the
 * background crawl machinery. Returns the deps a McpServer needs plus a
 * `triggerRecrawl` hook the recrawl tool calls.
 */
function bootstrap(): ServerDeps {
  const store = new DocStore();
  const searchEngine = new SearchEngine();

  const loaded = store.loadFromDisk();
  if (loaded && store.pageCount() > 0) {
    console.error(
      `[across-mcp] Loaded ${store.pageCount()} cached pages (last crawl: ${store.getLastCrawlTime()?.toISOString()})`
    );
    searchEngine.index(store.getAllPages());
  }

  function triggerRecrawl(): void {
    if (store.isCrawling()) return;
    store.setCrawling(true);
    console.error("[across-mcp] Starting background crawl...");
    crawlDocs(store, (current, total, url) => {
      console.error(`[across-mcp] Crawling ${current}/${total}: ${url}`);
    })
      .then((count) => {
        searchEngine.index(store.getAllPages());
        console.error(`[across-mcp] Crawl complete: ${count} pages indexed`);
      })
      .catch((err) => {
        console.error("[across-mcp] Crawl failed:", err);
      })
      .finally(() => {
        store.setCrawling(false);
      });
  }

  // Kick off an initial crawl if we have nothing cached or the cache is stale.
  // Runs in the background — never blocks transport startup. Tools surface a
  // warmup hint while the index is empty.
  if (!loaded || store.pageCount() === 0 || store.needsRecrawl()) {
    triggerRecrawl();
  }

  setInterval(() => {
    console.error("[across-mcp] Scheduled re-crawl tick");
    triggerRecrawl();
  }, RECRAWL_INTERVAL_MS);

  return { store, searchEngine, triggerRecrawl };
}

/**
 * stdio transport — the default. One long-lived McpServer bound to the
 * process's stdin/stdout, for local clients that launch this as a child
 * process (Claude Desktop/Code, Cursor, `npx mcp-server-across`).
 */
async function runStdio(deps: ServerDeps): Promise<void> {
  const mcpServer = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("[across-mcp] stdio transport ready");
}

/**
 * Streamable-HTTP transport — opt-in. Powers the hosted deployment.
 * Each request gets its own stateless MCP transport; the deps (store,
 * search index, recrawl hook) are shared singletons across requests.
 */
function runHttp(deps: ServerDeps): void {
  const port = Number(process.env.PORT) || 8080;

  const httpServer = createHttpServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    if (req.url === "/mcp") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — no session tracking needed
      });
      const mcpServer = createMcpServer(deps);
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(port, () => {
    console.error(`[across-mcp] HTTP server listening on port ${port}`);
  });
}

/**
 * Transport selection: default to stdio. Use HTTP when `--http` is passed,
 * `MCP_TRANSPORT=http`, or `PORT` is set (so existing Docker/hosted deploys
 * that export PORT keep serving HTTP unchanged).
 */
function useHttp(): boolean {
  return (
    process.argv.includes("--http") ||
    process.env.MCP_TRANSPORT === "http" ||
    process.env.PORT !== undefined
  );
}

async function main(): Promise<void> {
  const deps = bootstrap();
  if (useHttp()) {
    runHttp(deps);
  } else {
    await runStdio(deps);
  }
}

main().catch((err) => {
  console.error("[across-mcp] Fatal error:", err);
  process.exit(1);
});
