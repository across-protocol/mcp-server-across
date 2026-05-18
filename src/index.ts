#!/usr/bin/env node

import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { DocStore } from "./store.js";
import { SearchEngine } from "./search.js";
import { crawlDocs } from "./crawler.js";
import { createServer as createMcpServer } from "./server.js";

const PORT = Number(process.env.PORT) || 8080;
const RECRAWL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function main() {
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

  // HTTP server — each request gets its own stateless MCP transport.
  // store + searchEngine + triggerRecrawl are shared singletons across all requests.
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
      const mcpServer = createMcpServer({ store, searchEngine, triggerRecrawl });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(PORT, () => {
    console.error(`[across-mcp] HTTP server listening on port ${PORT}`);
  });

  if (!loaded || store.pageCount() === 0 || store.needsRecrawl()) {
    triggerRecrawl();
  }

  setInterval(() => {
    console.error("[across-mcp] Scheduled re-crawl tick");
    triggerRecrawl();
  }, RECRAWL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[across-mcp] Fatal error:", err);
  process.exit(1);
});
