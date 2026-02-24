#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DocStore } from "./store.js";
import { SearchEngine } from "./search.js";
import { crawlDocs } from "./crawler.js";
import { createServer } from "./server.js";

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

  // Create MCP server
  const server = createServer(store, searchEngine);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[across-mcp] Server started on stdio transport");

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
