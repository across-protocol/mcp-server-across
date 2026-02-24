import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocStore } from "./store.js";
import { SearchEngine } from "./search.js";
import { crawlDocs } from "./crawler.js";
import {
  SUPPORTED_CHAINS,
  API_ENDPOINTS,
  ACROSS_API_BASE,
} from "./data/known-urls.js";

export function createServer(store: DocStore, searchEngine: SearchEngine): McpServer {
  const server = new McpServer({
    name: "mcp-server-across",
    version: "1.0.0",
  });

  // ─── Tool 1: search_across_docs ───────────────────────────────────
  server.tool(
    "search_across_docs",
    "Search Across Protocol documentation. Use this to find information about cross-chain bridges, intents, fees, relayers, SDK usage, API endpoints, and more.",
    {
      query: z.string().describe("Search query (e.g. 'suggested fees', 'cross-chain swap', 'relayer setup')"),
      limit: z.number().optional().default(5).describe("Max results to return (default 5)"),
    },
    async ({ query, limit }) => {
      const results = searchEngine.search(query, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for "${query}". Try broader terms like "bridge", "swap", "fees", "relayer", or "SDK".`,
            },
          ],
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `### ${i + 1}. ${r.title}\n**Section:** ${r.section} | **URL:** ${r.url}\n**Relevance:** ${r.score}\n\n${r.snippet}\n`
        )
        .join("\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} results for "${query}":\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // ─── Tool 2: get_page ─────────────────────────────────────────────
  server.tool(
    "get_page",
    "Get the full content of a specific Across documentation page. Use a path like '/developer-quickstart/crosschain-swap' or a keyword like 'crosschain swap'.",
    {
      path: z.string().describe("Page path (e.g. '/developer-quickstart/crosschain-swap') or keyword to match"),
    },
    async ({ path }) => {
      const page = store.getPage(path);

      if (!page) {
        const available = store
          .getAllPages()
          .map((p) => `  - ${p.path} (${p.title})`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Page not found: "${path}"\n\nAvailable pages:\n${available}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `# ${page.title}\n\n**URL:** ${page.url}\n**Section:** ${page.section}\n**Last crawled:** ${page.lastCrawled}\n\n---\n\n${page.content}`,
          },
        ],
      };
    }
  );

  // ─── Tool 3: get_api_reference ────────────────────────────────────
  server.tool(
    "get_api_reference",
    "Get Across Protocol REST API endpoint reference. Lists all endpoints or details for a specific one. Endpoints are at app.across.to/api/.",
    {
      endpoint: z
        .string()
        .optional()
        .describe("Specific endpoint path (e.g. '/suggested-fees', '/available-routes'). Leave empty to list all."),
    },
    async ({ endpoint }) => {
      if (!endpoint) {
        const list = API_ENDPOINTS.map(
          (e) => `- **${e.method}** \`${ACROSS_API_BASE}${e.path}\` — ${e.description}`
        ).join("\n");

        // Also include content from the API reference doc page
        const apiPage = store.getPage("/reference/api-reference");
        const extra = apiPage
          ? `\n\n---\n\n## Detailed API Documentation\n\n${apiPage.content}`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `# Across Protocol API Endpoints\n\n**Base URL:** \`${ACROSS_API_BASE}\`\n\n${list}${extra}`,
            },
          ],
        };
      }

      const normalized = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
      const matches = API_ENDPOINTS.filter((e) =>
        e.path.includes(normalized)
      );

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No API endpoint found matching "${endpoint}". Available: ${API_ENDPOINTS.map((e) => e.path).join(", ")}`,
            },
          ],
        };
      }

      // Search for more detail in indexed docs
      const detailResults = searchEngine.search(
        endpoint.replace(/[/-]/g, " ").trim(),
        3
      );
      const details = detailResults
        .map((r) => `### From: ${r.title}\n${r.snippet}`)
        .join("\n\n");

      const endpointList = matches
        .map(
          (e) =>
            `## ${e.method} ${ACROSS_API_BASE}${e.path}\n\n${e.description}`
        )
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text: `${endpointList}\n\n---\n\n## Related Documentation\n\n${details}`,
          },
        ],
      };
    }
  );

  // ─── Tool 4: get_supported_chains ─────────────────────────────────
  server.tool(
    "get_supported_chains",
    "Get all blockchain networks supported by Across Protocol, including chain IDs for both mainnet and testnet.",
    {
      network: z
        .enum(["mainnet", "testnet", "all"])
        .optional()
        .default("all")
        .describe("Filter by network type"),
    },
    async ({ network }) => {
      let text = "# Across Protocol Supported Chains\n\n";

      if (network === "all" || network === "mainnet") {
        text += "## Mainnet Chains\n\n";
        text += "| Chain | Chain ID |\n|-------|----------|\n";
        for (const chain of SUPPORTED_CHAINS.mainnet) {
          text += `| ${chain.name} | ${chain.chainId} |\n`;
        }
        text += "\n";
      }

      if (network === "all" || network === "testnet") {
        text += "## Testnet Chains\n\n";
        text += "| Chain | Chain ID |\n|-------|----------|\n";
        for (const chain of SUPPORTED_CHAINS.testnet) {
          text += `| ${chain.name} | ${chain.chainId} |\n`;
        }
      }

      // Append any additional info from the indexed docs
      const chainsPage = store.getPage("/reference/supported-chains");
      if (chainsPage) {
        text += `\n\n---\n\n## Additional Details\n\n${chainsPage.content}`;
      }

      return { content: [{ type: "text", text }] };
    }
  );

  // ─── Tool 5: get_bridge_fees ──────────────────────────────────────
  server.tool(
    "get_bridge_fees",
    "Query the Across API for live suggested bridge fees for a specific token route. Requires token address, origin chain ID, destination chain ID, and amount.",
    {
      token: z.string().describe("Token address on the origin chain"),
      originChainId: z.number().describe("Origin chain ID (e.g. 1 for Ethereum)"),
      destinationChainId: z.number().describe("Destination chain ID (e.g. 42161 for Arbitrum)"),
      amount: z.string().describe("Amount in smallest unit (wei for ETH, etc.)"),
    },
    async ({ token, originChainId, destinationChainId, amount }) => {
      try {
        const params = new URLSearchParams({
          token,
          originChainId: String(originChainId),
          destinationChainId: String(destinationChainId),
          amount,
        });

        const response = await fetch(
          `${ACROSS_API_BASE}/suggested-fees?${params}`,
          {
            headers: { Accept: "application/json" },
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          return {
            content: [
              {
                type: "text",
                text: `API error (${response.status}): ${errText}\n\nMake sure the token address is correct for the origin chain and the route is supported.`,
              },
            ],
          };
        }

        const data = await response.json();
        return {
          content: [
            {
              type: "text",
              text: `# Bridge Fee Quote\n\n**Route:** Chain ${originChainId} → Chain ${destinationChainId}\n**Token:** ${token}\n**Amount:** ${amount}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch bridge fees: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  // ─── Tool 6: get_code_examples ────────────────────────────────────
  server.tool(
    "get_code_examples",
    "Get code examples from Across documentation. Filter by topic like 'sdk', 'swap', 'deposit', 'relayer', 'viem', 'ethers', etc.",
    {
      topic: z
        .string()
        .optional()
        .describe("Topic to filter examples (e.g. 'sdk', 'swap', 'viem'). Leave empty for all."),
    },
    async ({ topic }) => {
      const examples = store.getCodeExamples(topic);

      if (examples.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No code examples found${topic ? ` for topic "${topic}"` : ""}. Try topics like "sdk", "swap", "deposit", "viem", "ethers", "relayer".`,
            },
          ],
        };
      }

      const formatted = examples
        .slice(0, 10)
        .map(
          (ex, i) =>
            `### Example ${i + 1} — from "${ex.title}"\n**Source:** ${ex.url}\n\n\`\`\`\n${ex.code}\n\`\`\``
        )
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text: `# Code Examples${topic ? ` — "${topic}"` : ""}\n\nFound ${examples.length} examples${examples.length > 10 ? " (showing first 10)" : ""}:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // ─── Tool 7: recrawl_docs ────────────────────────────────────────
  server.tool(
    "recrawl_docs",
    "Force a re-crawl of all Across documentation pages. Use this if docs seem outdated.",
    {},
    async () => {
      const count = await crawlDocs(store, (current, total, url) => {
        console.error(`[crawl] ${current}/${total}: ${url}`);
      });

      // Re-index search
      searchEngine.index(store.getAllPages());

      return {
        content: [
          {
            type: "text",
            text: `Re-crawl complete. Successfully indexed ${count} pages. Last crawl: ${store.getLastCrawlTime()?.toISOString()}`,
          },
        ],
      };
    }
  );

  return server;
}
