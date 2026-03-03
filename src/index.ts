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

  // Try loading cached docs from disk
  const loaded = store.loadFromDisk();
  if (loaded && store.pageCount() > 0) {
    console.error(
      `[across-mcp] Loaded ${store.pageCount()} cached pages (last crawl: ${store.getLastCrawlTime()?.toISOString()})`
    );
    searchEngine.index(store.getAllPages());
  }

  // HTTP server — each request gets its own stateless MCP transport.
  // store + searchEngine are shared singletons across all requests.
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
      const mcpServer = createMcpServer(store, searchEngine);
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

  // Crawl in background if cache is stale or missing
  if (!loaded || store.pageCount() === 0 || store.needsRecrawl()) {
    console.error("[across-mcp] Starting background crawl...");
    crawlDocs(store, (current, total, url) => {
      console.error(`[across-mcp] Crawling ${current}/${total}: ${url}`);
    })
      .then((count) => {
        console.error(`[across-mcp] Crawl complete: ${count} pages indexed`);
        searchEngine.index(store.getAllPages());
      })
      .catch((err) => {
        console.error("[across-mcp] Crawl failed:", err);
      });
  }

  // Schedule periodic re-crawl
  setInterval(async () => {
    console.error("[across-mcp] Starting scheduled re-crawl...");
    try {
      const count = await crawlDocs(store);
      searchEngine.index(store.getAllPages());
      console.error(`[across-mcp] Scheduled re-crawl complete: ${count} pages`);
    } catch (err) {
      console.error("[across-mcp] Scheduled re-crawl failed:", err);
    }
  }, RECRAWL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[across-mcp] Fatal error:", err);
  process.exit(1);
});
