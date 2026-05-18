import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

function userMessage(text: string): GetPromptResult["messages"][number] {
  return { role: "user", content: { type: "text", text } };
}

export function buildCrosschainSwapPrompt(args: {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount?: string;
  recipient?: string;
}): GetPromptResult {
  const text = [
    `You are helping the user build a crosschain swap on Across Protocol.`,
    ``,
    `Requested route:`,
    `- From: ${args.fromToken} on ${args.fromChain}`,
    `- To: ${args.toToken} on ${args.toChain}`,
    args.amount ? `- Amount: ${args.amount}` : null,
    args.recipient ? `- Recipient: ${args.recipient}` : null,
    ``,
    `Use the following steps and the available Across MCP tools:`,
    ``,
    `1. Call \`get_supported_chains\` to confirm both chains are supported and resolve their chain IDs.`,
    `2. Call \`get_available_routes\` with the resolved chain IDs and the input/output tokens to confirm the route is live.`,
    `3. Call \`get_limits\` for the input token on the origin chain to check min/max transfer sizes.`,
    `4. Call \`get_swap_quote\` with the resolved parameters. This returns ready-to-sign calldata plus the expected output amount, fees, and fill time.`,
    `5. Present the quote to the user and explain the trade-offs (fees, slippage, fill time). Surface the \`approvalTxns\` and the deposit \`tx\` payload so the user (or their wallet integration) can sign and broadcast.`,
    ``,
    `If any step fails, call \`search_across_docs\` for the relevant concept (e.g. "available routes", "swap approval", "slippage").`,
    `Do not invent token addresses. If the user has not provided them, use \`search_across_docs\` for "selected token addresses" and ask the user to confirm.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { messages: [userMessage(text)] };
}

export function diagnoseDepositPrompt(args: {
  depositTxHash?: string;
  depositId?: string;
  originChainId?: string;
  network?: string;
}): GetPromptResult {
  const text = [
    `Diagnose the status of an Across deposit.`,
    ``,
    `Inputs provided:`,
    args.depositTxHash ? `- Deposit tx hash: ${args.depositTxHash}` : null,
    args.depositId ? `- Deposit ID: ${args.depositId}` : null,
    args.originChainId ? `- Origin chain ID: ${args.originChainId}` : null,
    args.network ? `- Network: ${args.network}` : null,
    ``,
    `Steps:`,
    ``,
    `1. Call \`track_deposit\` with the provided identifiers. Report the lifecycle state (\`pending\`, \`filled\`, \`refunded\`, \`expired\`, etc.) verbatim.`,
    `2. If the deposit is still pending, compute time-since-deposit and compare against the expected fill time from the quote (typically seconds-to-minutes on Across).`,
    `3. If the deposit failed or refunded, call \`search_across_docs\` for "intent lifecycle" and "refund" to explain the likely cause to the user.`,
    `4. If the deposit succeeded, surface the fill tx hash and any output-token transfer to the recipient.`,
    `5. Recommend a concrete next action: wait, contact support, retry with adjusted slippage, or claim a refund.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { messages: [userMessage(text)] };
}
