import {
  ACROSS_API_BASE,
  ACROSS_TESTNET_API_BASE,
} from "./data/known-urls.js";

export type Network = "mainnet" | "testnet";

const REQUEST_TIMEOUT_MS = 20_000;

function baseFor(network: Network): string {
  return network === "testnet" ? ACROSS_TESTNET_API_BASE : ACROSS_API_BASE;
}

async function getJson<T = unknown>(
  network: Network,
  path: string,
  params: Record<string, string | number | undefined>
): Promise<T> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }

  const url = `${baseFor(network)}${path}${search.toString() ? `?${search}` : ""}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Across API ${res.status} ${res.statusText} for ${path}: ${text || "(no body)"}`
      );
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface SuggestedFeesParams {
  token: string;
  originChainId: number;
  destinationChainId: number;
  amount: string;
  recipient?: string;
  message?: string;
  network?: Network;
}

export function getSuggestedFees(p: SuggestedFeesParams) {
  return getJson(p.network ?? "mainnet", "/suggested-fees", {
    token: p.token,
    originChainId: p.originChainId,
    destinationChainId: p.destinationChainId,
    amount: p.amount,
    recipient: p.recipient,
    message: p.message,
  });
}

export interface SwapQuoteParams {
  inputToken: string;
  outputToken: string;
  originChainId: number;
  destinationChainId: number;
  amount: string;
  depositor: string;
  recipient?: string;
  tradeType?: "exactInput" | "exactOutput" | "minOutput";
  /** `"auto"` (default) or a decimal slippage value between 0 and 1. */
  slippage?: string;
  network?: Network;
}

/**
 * Across mandates a 2-byte hex integrator ID on production/mainnet swap calls.
 * It's a public identifier (sent as a query param), so a default is fine;
 * override with ACROSS_INTEGRATOR_ID in the environment if needed.
 */
function integratorId(): string {
  return process.env.ACROSS_INTEGRATOR_ID || "0x00a8";
}

export function getSwapQuote(p: SwapQuoteParams) {
  return getJson(p.network ?? "mainnet", "/swap/approval", {
    inputToken: p.inputToken,
    outputToken: p.outputToken,
    originChainId: p.originChainId,
    destinationChainId: p.destinationChainId,
    amount: p.amount,
    depositor: p.depositor,
    recipient: p.recipient ?? p.depositor,
    tradeType: p.tradeType ?? "minOutput",
    slippage: p.slippage ?? "auto",
    integratorId: integratorId(),
  });
}

export interface TrackDepositParams {
  depositTxHash?: string;
  originChainId?: number;
  depositId?: string;
  network?: Network;
}

export function trackDeposit(p: TrackDepositParams) {
  if (!p.depositTxHash && p.depositId === undefined) {
    throw new Error("Provide either depositTxHash or depositId");
  }
  return getJson(p.network ?? "mainnet", "/deposit/status", {
    depositTxHash: p.depositTxHash,
    originChainId: p.originChainId,
    depositId: p.depositId,
  });
}

export interface ListDepositsParams {
  depositor: string;
  status?: "pending" | "filled" | "refunded" | "expired";
  limit?: number;
  network?: Network;
}

export function listDeposits(p: ListDepositsParams) {
  return getJson(p.network ?? "mainnet", "/deposits", {
    depositor: p.depositor,
    status: p.status,
    limit: p.limit ?? 25,
  });
}

export interface AvailableRoutesParams {
  originChainId?: number;
  destinationChainId?: number;
  originToken?: string;
  destinationToken?: string;
  network?: Network;
}

export function getAvailableRoutes(p: AvailableRoutesParams = {}) {
  return getJson(p.network ?? "mainnet", "/available-routes", {
    originChainId: p.originChainId,
    destinationChainId: p.destinationChainId,
    originToken: p.originToken,
    destinationToken: p.destinationToken,
  });
}

export interface LimitsParams {
  token: string;
  originChainId: number;
  destinationChainId: number;
  network?: Network;
}

export function getLimits(p: LimitsParams) {
  return getJson(p.network ?? "mainnet", "/limits", {
    token: p.token,
    originChainId: p.originChainId,
    destinationChainId: p.destinationChainId,
  });
}
