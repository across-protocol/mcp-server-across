/**
 * Known documentation URLs for docs.across.to
 * These are crawled and indexed for the MCP server.
 */

export interface DocUrl {
  url: string;
  section: string;
  title: string;
}

export const KNOWN_URLS: DocUrl[] = [
  // Introduction
  { url: "https://docs.across.to", section: "overview", title: "Across Protocol Overview" },
  { url: "https://docs.across.to/introduction", section: "overview", title: "Introduction" },

  // Developer Quickstart
  { url: "https://docs.across.to/developer-quickstart/crosschain-swap", section: "quickstart", title: "Crosschain Swap Integration" },
  { url: "https://docs.across.to/developer-quickstart/erc-7683-in-production", section: "quickstart", title: "ERC-7683 in Production" },
  { url: "https://docs.across.to/developer-quickstart/embedded-crosschain-swap-actions", section: "quickstart", title: "Embedded Crosschain Actions" },
  { url: "https://docs.across.to/developer-quickstart/embedded-crosschain-swap-actions/transfer-erc20-tokens-after-swap", section: "quickstart", title: "Transfer ERC20 After Swap" },

  // Concepts
  { url: "https://docs.across.to/concepts/what-are-crosschain-intents", section: "concepts", title: "What Are Crosschain Intents" },
  { url: "https://docs.across.to/concepts/intent-lifecycle-in-across", section: "concepts", title: "Intent Lifecycle in Across" },

  // Reference
  { url: "https://docs.across.to/reference/api-reference", section: "reference", title: "API Reference" },
  { url: "https://docs.across.to/reference/app-sdk-reference", section: "reference", title: "App SDK Reference" },
  { url: "https://docs.across.to/reference/supported-chains", section: "reference", title: "Supported Chains" },
  { url: "https://docs.across.to/reference/selected-token-addresses", section: "reference", title: "Selected Token Addresses" },
  { url: "https://docs.across.to/reference/contract-addresses", section: "reference", title: "Contract Addresses" },

  // Relayers
  { url: "https://docs.across.to/relayers/running-a-relayer", section: "relayers", title: "Running a Relayer" },
  { url: "https://docs.across.to/relayers/relayer-nomination", section: "relayers", title: "Relayer Nomination" },

  // Resources
  { url: "https://docs.across.to/resources/support-links", section: "resources", title: "Support Links" },
  { url: "https://docs.across.to/resources/bug-bounty", section: "resources", title: "Bug Bounty" },
  { url: "https://docs.across.to/resources/audits", section: "resources", title: "Audits" },
];

export const ACROSS_API_BASE = "https://app.across.to/api";
export const ACROSS_TESTNET_API_BASE = "https://testnet.across.to/api";

export const API_ENDPOINTS = [
  { path: "/swap/approval", method: "GET", description: "Get executable calldata for crosschain swaps" },
  { path: "/swap/approval", method: "POST", description: "Build embedded crosschain swap actions" },
  { path: "/swap/chains", method: "GET", description: "List supported blockchains" },
  { path: "/swap/tokens", method: "GET", description: "List whitelisted tokens" },
  { path: "/swap/sources", method: "GET", description: "List liquidity sources" },
  { path: "/deposit/status", method: "GET", description: "Track deposit lifecycle status" },
  { path: "/deposits", method: "GET", description: "Retrieve all deposits for a depositor address" },
  { path: "/suggested-fees", method: "GET", description: "Get fee quotes for bridging tokens" },
  { path: "/limits", method: "GET", description: "Get system transfer limits" },
  { path: "/available-routes", method: "GET", description: "Discover available transfer routes between chains" },
];

export const SUPPORTED_CHAINS = {
  mainnet: [
    { name: "Ethereum", chainId: 1 },
    { name: "Optimism", chainId: 10 },
    { name: "Polygon", chainId: 137 },
    { name: "Arbitrum", chainId: 42161 },
    { name: "Base", chainId: 8453 },
    { name: "zkSync Era", chainId: 324 },
    { name: "Linea", chainId: 59144 },
    { name: "Scroll", chainId: 534352 },
    { name: "Blast", chainId: 81457 },
    { name: "Mode", chainId: 34443 },
    { name: "Lisk", chainId: 1135 },
    { name: "BNB Chain", chainId: 56 },
    { name: "Ink", chainId: 57073 },
    { name: "Lens", chainId: 232 },
    { name: "World Chain", chainId: 480 },
    { name: "Zora", chainId: 7777777 },
    { name: "Unichain", chainId: 130 },
    { name: "Soneium", chainId: 1868 },
    { name: "Plasma", chainId: 1012 },
    { name: "MegaETH", chainId: 6342 },
    { name: "Monad", chainId: 143 },
    { name: "HyperEVM", chainId: 999 },
  ],
  testnet: [
    { name: "Ethereum Sepolia", chainId: 11155111 },
    { name: "Arbitrum Sepolia", chainId: 421614 },
    { name: "Base Sepolia", chainId: 84532 },
    { name: "Optimism Sepolia", chainId: 11155420 },
    { name: "Polygon Amoy", chainId: 80002 },
    { name: "Blast Testnet", chainId: 168587773 },
    { name: "Lisk Testnet", chainId: 4202 },
    { name: "Mode Testnet", chainId: 919 },
  ],
};
