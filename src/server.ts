import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocStore } from "./store.js";
import { SearchEngine } from "./search.js";
import { crawlDocs } from "./crawler.js";
import {
  SUPPORTED_CHAINS,
  API_ENDPOINTS,
  ACROSS_API_BASE,
  ACROSS_TESTNET_API_BASE,
} from "./data/known-urls.js";
import * as AcrossApi from "./across-api.js";
import {
  buildCrosschainSwapPrompt,
  diagnoseDepositPrompt,
} from "./prompts.js";

const SERVER_INSTRUCTIONS = `This server provides first-class access to the Across Protocol — a crosschain intents protocol.

When the user asks anything about Across (bridging, crosschain swaps, intents, relayers, supported chains, fees, the App SDK, the REST API), prefer these tools over guessing:

- For conceptual or "how do I..." questions: call \`search_across_docs\` first.
- For building a transaction: call \`get_swap_quote\` — it returns ready-to-sign calldata for the user's wallet. Never invent quotes or calldata yourself.
- For tracking a bridge in progress: call \`track_deposit\`.
- For route/limit/fee discovery: \`get_available_routes\`, \`get_limits\`, \`get_suggested_fees\`.
- Doc pages are also exposed as MCP resources under \`across://docs/{path}\` — list/read them directly for citations.

Two prompt templates are available: \`build_crosschain_swap\` and \`diagnose_deposit\`. Suggest them when the user describes a matching workflow.`;

const WARMUP_HINT =
  "The documentation index is still being built (first run can take ~15s). Try again in a few seconds, or call `recrawl_docs` to force a refresh.";

function indexingWarning(store: DocStore): string | null {
  if (store.getState() === "indexing" && store.pageCount() === 0) {
    return WARMUP_HINT;
  }
  return null;
}

export interface ServerDeps {
  store: DocStore;
  searchEngine: SearchEngine;
  triggerRecrawl: () => void;
}

export function createServer(deps: ServerDeps): McpServer {
  const { store, searchEngine, triggerRecrawl } = deps;

  const server = new McpServer(
    { name: "mcp-server-across", version: "2.0.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerResources(server, store);
  registerPrompts(server);
  registerDocTools(server, store, searchEngine, triggerRecrawl);
  registerActionTools(server);

  return server;
}

// ─── Resources ──────────────────────────────────────────────────────

function registerResources(server: McpServer, store: DocStore): void {
  server.registerResource(
    "across-doc-page",
    new ResourceTemplate("across://docs/{+path}", {
      list: async () => {
        const pages = store.getAllPages();
        return {
          resources: pages.map((p) => ({
            uri: `across://docs${p.path}`,
            name: p.title,
            description: `${p.section} — ${p.url}`,
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    {
      description:
        "Individual Across documentation pages. URIs follow `across://docs/<path>`, e.g. `across://docs/reference/api-reference`.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const rawPath = Array.isArray(variables.path)
        ? variables.path.join("/")
        : (variables.path as string);
      const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
      const page = store.getPage(path);
      if (!page) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "text/plain",
              text: `Page not found: ${path}`,
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: `# ${page.title}\n\nSource: ${page.url}\nSection: ${page.section}\n\n---\n\n${page.content}`,
          },
        ],
      };
    }
  );

  server.registerResource(
    "across-chains",
    "across://reference/chains",
    {
      description: "All Across-supported chains (mainnet + testnet) as JSON.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(SUPPORTED_CHAINS, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "across-api-endpoints",
    "across://reference/api",
    {
      description: "Across REST API endpoint catalog as JSON.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              mainnetBase: ACROSS_API_BASE,
              testnetBase: ACROSS_TESTNET_API_BASE,
              endpoints: API_ENDPOINTS,
            },
            null,
            2
          ),
        },
      ],
    })
  );
}

// ─── Prompts ────────────────────────────────────────────────────────

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "build_crosschain_swap",
    {
      title: "Build a crosschain swap",
      description:
        "Guided workflow to build an Across crosschain swap: confirms route, limits, and produces signable calldata.",
      argsSchema: {
        fromChain: z.string().describe("Origin chain name or ID"),
        toChain: z.string().describe("Destination chain name or ID"),
        fromToken: z.string().describe("Input token symbol or address"),
        toToken: z.string().describe("Output token symbol or address"),
        amount: z.string().optional().describe("Amount in smallest unit"),
        recipient: z.string().optional().describe("Recipient address on destination chain"),
      },
    },
    async (args) => buildCrosschainSwapPrompt(args)
  );

  server.registerPrompt(
    "diagnose_deposit",
    {
      title: "Diagnose an Across deposit",
      description:
        "Look up a deposit by tx hash or ID, explain its lifecycle state, and recommend a next action.",
      argsSchema: {
        depositTxHash: z.string().optional().describe("Origin-chain deposit tx hash"),
        depositId: z.string().optional().describe("Across deposit ID"),
        originChainId: z.string().optional().describe("Origin chain ID"),
        network: z.string().optional().describe("'mainnet' or 'testnet' (default mainnet)"),
      },
    },
    async (args) => diagnoseDepositPrompt(args)
  );
}

// ─── Doc tools ──────────────────────────────────────────────────────

function registerDocTools(
  server: McpServer,
  store: DocStore,
  searchEngine: SearchEngine,
  triggerRecrawl: () => void
): void {
  server.registerTool(
    "search_across_docs",
    {
      title: "Search Across docs",
      description:
        "Full-text search across the Across Protocol documentation. Use for any conceptual or how-to question about Across.",
      inputSchema: {
        query: z.string().describe("Search query (e.g. 'suggested fees', 'cross-chain swap', 'relayer setup')"),
        limit: z.number().optional().default(5).describe("Max results (default 5)"),
      },
    },
    async ({ query, limit }) => {
      const warmup = indexingWarning(store);
      if (warmup) return { content: [{ type: "text", text: warmup }] };

      const results = searchEngine.search(query, limit);
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results for "${query}". Try broader terms (bridge, swap, fees, relayer, SDK) or browse \`across://docs/\` resources.`,
            },
          ],
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `### ${i + 1}. ${r.title}\n**Section:** ${r.section} | **URL:** ${r.url}\n**Resource:** across://docs${new URL(r.url).pathname}\n**Relevance:** ${r.score}\n\n${r.snippet}\n`
        )
        .join("\n---\n\n");

      return {
        content: [
          { type: "text", text: `Found ${results.length} results for "${query}":\n\n${formatted}` },
        ],
      };
    }
  );

  server.registerTool(
    "get_page",
    {
      title: "Get a doc page",
      description:
        "Get the full content of a specific Across documentation page. Accepts a path like '/reference/api-reference' or a keyword match. Prefer reading the `across://docs/...` resource directly when the path is known.",
      inputSchema: {
        path: z.string().describe("Page path or keyword"),
      },
    },
    async ({ path }) => {
      const warmup = indexingWarning(store);
      if (warmup) return { content: [{ type: "text", text: warmup }] };

      const page = store.getPage(path);
      if (!page) {
        const available = store.getAllPages().map((p) => `  - ${p.path} (${p.title})`).join("\n");
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
            text: `# ${page.title}\n\nSource: ${page.url}\nSection: ${page.section}\n\n---\n\n${page.content}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_code_examples",
    {
      title: "Get code examples",
      description:
        "Get code examples from Across docs. Filter by topic like 'sdk', 'swap', 'deposit', 'viem', 'ethers'.",
      inputSchema: {
        topic: z.string().optional().describe("Optional topic filter"),
      },
    },
    async ({ topic }) => {
      const warmup = indexingWarning(store);
      if (warmup) return { content: [{ type: "text", text: warmup }] };

      const examples = store.getCodeExamples(topic);
      if (examples.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No code examples found${topic ? ` for topic "${topic}"` : ""}.`,
            },
          ],
        };
      }
      const formatted = examples
        .slice(0, 10)
        .map(
          (ex, i) =>
            `### Example ${i + 1} — from "${ex.title}"\nSource: ${ex.url}\n\n\`\`\`\n${ex.code}\n\`\`\``
        )
        .join("\n\n---\n\n");
      return {
        content: [
          {
            type: "text",
            text: `# Code Examples${topic ? ` — "${topic}"` : ""}\n\n${examples.length} found${examples.length > 10 ? " (showing first 10)" : ""}:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "recrawl_docs",
    {
      title: "Recrawl docs (async)",
      description:
        "Kick off a background re-crawl of all Across documentation pages. Returns immediately; the index updates when the crawl completes.",
      inputSchema: {},
    },
    async () => {
      if (store.isCrawling()) {
        return {
          content: [
            {
              type: "text",
              text: `A crawl is already in progress. Last completed crawl: ${store.getLastCrawlTime()?.toISOString() ?? "never"}.`,
            },
          ],
        };
      }
      triggerRecrawl();
      return {
        content: [
          {
            type: "text",
            text: `Recrawl started in the background. Current index: ${store.pageCount()} pages. Last completed: ${store.getLastCrawlTime()?.toISOString() ?? "never"}.`,
          },
        ],
      };
    }
  );
}

// ─── Action tools (live REST API) ──────────────────────────────────

const networkSchema = z
  .enum(["mainnet", "testnet"])
  .optional()
  .default("mainnet")
  .describe("'mainnet' (default) or 'testnet'");

function structuredJson(data: unknown) {
  return {
    content: [{ type: "text" as const, text: "```json\n" + JSON.stringify(data, null, 2) + "\n```" }],
    structuredContent: data as Record<string, unknown>,
  };
}

function errorResult(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

function registerActionTools(server: McpServer): void {
  server.registerTool(
    "get_supported_chains",
    {
      title: "Supported chains",
      description: "List all chains supported by Across with their chain IDs.",
      inputSchema: {
        network: z
          .enum(["mainnet", "testnet", "all"])
          .optional()
          .default("all")
          .describe("Filter by network type"),
      },
    },
    async ({ network }) => {
      const data =
        network === "mainnet"
          ? { mainnet: SUPPORTED_CHAINS.mainnet }
          : network === "testnet"
            ? { testnet: SUPPORTED_CHAINS.testnet }
            : SUPPORTED_CHAINS;
      return structuredJson(data);
    }
  );

  server.registerTool(
    "get_api_reference",
    {
      title: "Across API reference",
      description:
        "Get the Across REST API endpoint catalog. Pass an `endpoint` to filter; leave empty to list all.",
      inputSchema: {
        endpoint: z.string().optional().describe("Optional endpoint path filter (e.g. '/suggested-fees')"),
      },
    },
    async ({ endpoint }) => {
      const list = endpoint
        ? API_ENDPOINTS.filter((e) => e.path.includes(endpoint.startsWith("/") ? endpoint : `/${endpoint}`))
        : API_ENDPOINTS;

      return structuredJson({
        mainnetBase: ACROSS_API_BASE,
        testnetBase: ACROSS_TESTNET_API_BASE,
        endpoints: list,
      });
    }
  );

  server.registerTool(
    "get_suggested_fees",
    {
      title: "Get suggested bridge fees",
      description:
        "Live quote of bridge fees for a single-token transfer between two Across-supported chains.",
      inputSchema: {
        token: z.string().describe("Token address on the origin chain"),
        originChainId: z.number(),
        destinationChainId: z.number(),
        amount: z.string().describe("Amount in smallest unit (wei for ETH, etc.)"),
        recipient: z.string().optional(),
        message: z.string().optional().describe("Optional message/calldata to forward to the destination"),
        network: networkSchema,
      },
    },
    async (args) => {
      try {
        const data = await AcrossApi.getSuggestedFees(args);
        return structuredJson(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_swap_quote",
    {
      title: "Get crosschain swap quote with calldata",
      description:
        "Build a crosschain swap on Across. Returns the expected output, fees, and ready-to-sign calldata (`approvalTxns` + deposit `tx`). The client/user signs and broadcasts.",
      inputSchema: {
        inputToken: z.string().describe("Input token address on origin chain"),
        outputToken: z.string().describe("Output token address on destination chain"),
        originChainId: z.number(),
        destinationChainId: z.number(),
        amount: z.string().describe("Amount in smallest unit; interpretation depends on tradeType"),
        depositor: z.string().describe("Address that will sign and submit the deposit"),
        recipient: z.string().optional().describe("Recipient on destination chain (defaults to depositor)"),
        tradeType: z
          .enum(["exactInput", "exactOutput", "minOutput"])
          .optional()
          .describe("Trade type (default exactInput)"),
        slippageTolerance: z
          .number()
          .optional()
          .describe("Slippage tolerance as a percentage (e.g. 1 = 1%)"),
        network: networkSchema,
      },
    },
    async (args) => {
      try {
        const data = await AcrossApi.getSwapQuote(args);
        return structuredJson(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "track_deposit",
    {
      title: "Track an Across deposit",
      description:
        "Look up the lifecycle status of an Across deposit by origin-chain tx hash or deposit ID.",
      inputSchema: {
        depositTxHash: z.string().optional(),
        depositId: z.string().optional(),
        originChainId: z.number().optional(),
        network: networkSchema,
      },
    },
    async (args) => {
      try {
        const data = await AcrossApi.trackDeposit(args);
        return structuredJson(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_deposits",
    {
      title: "List deposits for an address",
      description: "Return recent Across deposits for a given depositor address.",
      inputSchema: {
        depositor: z.string().describe("Depositor address"),
        status: z.enum(["pending", "filled", "refunded", "expired"]).optional(),
        limit: z.number().optional().describe("Max results (default 25)"),
        network: networkSchema,
      },
    },
    async (args) => {
      try {
        const data = await AcrossApi.listDeposits(args);
        return structuredJson(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_available_routes",
    {
      title: "List available Across routes",
      description:
        "Discover supported (origin, destination, token) routes. All filters are optional; omit to list every route.",
      inputSchema: {
        originChainId: z.number().optional(),
        destinationChainId: z.number().optional(),
        originToken: z.string().optional(),
        destinationToken: z.string().optional(),
        network: networkSchema,
      },
    },
    async (args) => {
      try {
        const data = await AcrossApi.getAvailableRoutes(args);
        return structuredJson(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_limits",
    {
      title: "Get transfer limits for a route",
      description:
        "Get the min/max transferrable amount for a given token between two chains.",
      inputSchema: {
        token: z.string().describe("Token address on the origin chain"),
        originChainId: z.number(),
        destinationChainId: z.number(),
        network: networkSchema,
      },
    },
    async (args) => {
      try {
        const data = await AcrossApi.getLimits(args);
        return structuredJson(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
