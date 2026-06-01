// Browser-safe chain metadata for the swap UI. Kept separate from the server's
// known-urls.ts so the iframe bundle pulls in no Node dependencies.

export interface ChainInfo {
  chainId: number;
  name: string;
}

export const MAINNET_CHAINS: ChainInfo[] = [
  { chainId: 1, name: "Ethereum" },
  { chainId: 10, name: "Optimism" },
  { chainId: 137, name: "Polygon" },
  { chainId: 42161, name: "Arbitrum" },
  { chainId: 8453, name: "Base" },
  { chainId: 324, name: "zkSync Era" },
  { chainId: 59144, name: "Linea" },
  { chainId: 81457, name: "Blast" },
  { chainId: 34443, name: "Mode" },
  { chainId: 1135, name: "Lisk" },
  { chainId: 56, name: "BNB Chain" },
  { chainId: 57073, name: "Ink" },
  { chainId: 232, name: "Lens" },
  { chainId: 480, name: "World Chain" },
  { chainId: 7777777, name: "Zora" },
  { chainId: 130, name: "Unichain" },
  { chainId: 1868, name: "Soneium" },
];

const BY_ID = new Map(MAINNET_CHAINS.map((c) => [c.chainId, c]));

export function chainName(chainId: number | undefined): string {
  if (chainId === undefined) return "unknown chain";
  return BY_ID.get(chainId)?.name ?? `chain ${chainId}`;
}

export const MAINNET_CHAIN_IDS = MAINNET_CHAINS.map((c) => c.chainId);
