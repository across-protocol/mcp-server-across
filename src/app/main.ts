/**
 * Across swap MCP App — the interactive UI rendered inside the host's
 * sandboxed iframe (Claude web). It receives a /swap/approval quote from the
 * `swap_with_wallet` tool, shows the route/fees with a mandatory
 * verify-before-sign step, connects the user's wallet over WalletConnect,
 * submits the approval + deposit transactions (the user signs in their own
 * wallet), then polls deposit status and reports the outcome back to the model.
 *
 * Security model: this code runs client-side in the user's browser. It never
 * holds keys — every transaction is signed by the user's own wallet.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { chainName, MAINNET_CHAIN_IDS } from "./chains.js";

// Injected at build time by scripts/build-ui.mjs via esbuild `define`.
declare const __WC_PROJECT_ID__: string;

// ─── Quote shape (subset of /swap/approval we render) ──────────────────

interface Txn {
  chainId: number;
  to: string;
  data: string;
  value?: string;
}

interface SwapQuote {
  crossSwapType?: string;
  checks?: {
    allowance?: { token: string; spender: string; actual: string; expected: string };
    balance?: { token: string; actual: string; expected: string };
  };
  approvalTxns?: Txn[];
  steps?: unknown;
  inputAmount?: string;
  expectedOutputAmount?: string;
  minOutputAmount?: string;
  fees?: Record<string, string>;
  swapTx?: Txn & {
    simulationSuccess?: boolean;
    gas?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  expectedFillTime?: number;
  quoteExpiryTimestamp?: number;
  // Echoed input we attach server-side so the UI can label things.
  _input?: {
    inputToken: string;
    outputToken: string;
    originChainId: number;
    destinationChainId: number;
    amount: string;
  };
}

// ─── Small DOM + format helpers ────────────────────────────────────────

function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e;
}

function h(tag: string, props: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}

/** Decimal string → 0x-quantity hex for eth_sendTransaction params. */
function toHexQuantity(dec: string | number | undefined): string | undefined {
  if (dec === undefined || dec === null || dec === "") return undefined;
  try {
    return "0x" + BigInt(dec).toString(16);
  } catch {
    return undefined;
  }
}

function shortAddr(a: string | undefined): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// ─── App state ─────────────────────────────────────────────────────────

const app = new App();
let quote: SwapQuote | null = null;
let provider: InstanceType<typeof EthereumProvider> | null = null;
let account: string | null = null;
let countdownTimer: number | undefined;

function setStatus(msg: string, kind: "info" | "error" | "success" = "info"): void {
  const s = $("status");
  s.textContent = msg;
  s.className = `status ${kind}`;
}

function quoteExpired(): boolean {
  const exp = quote?.quoteExpiryTimestamp;
  // quoteExpiryTimestamp is unix seconds.
  return typeof exp === "number" && exp * 1000 <= Date.now();
}

// ─── Rendering ─────────────────────────────────────────────────────────

function renderQuote(): void {
  if (!quote) return;
  const root = $("content");
  root.replaceChildren();

  const inp = quote._input;
  const origin = chainName(quote.swapTx?.chainId ?? inp?.originChainId);
  const dest = chainName(inp?.destinationChainId);

  // Route header
  root.append(
    h("div", { class: "route" },
      h("span", { class: "chain" }, origin),
      h("span", { class: "arrow" }, "→"),
      h("span", { class: "chain" }, dest)
    )
  );

  // Amounts + fees grid
  const grid = h("div", { class: "grid" });
  const row = (label: string, value: string) =>
    grid.append(h("div", { class: "k" }, label), h("div", { class: "v" }, value));
  if (quote.inputAmount) row("Input amount", quote.inputAmount);
  if (quote.expectedOutputAmount) row("Expected output", quote.expectedOutputAmount);
  if (quote.minOutputAmount) row("Minimum output", quote.minOutputAmount);
  if (quote.fees?.total) row("Total fees", quote.fees.total);
  if (typeof quote.expectedFillTime === "number") row("Est. fill time", `~${quote.expectedFillTime}s`);
  if (quote.swapTx) row("Deposit to", shortAddr(quote.swapTx.to));
  root.append(grid);

  // Simulation warning
  if (quote.swapTx && quote.swapTx.simulationSuccess === false) {
    root.append(h("div", { class: "warn" }, "⚠️ Across could not simulate this transaction successfully. Proceed only if you understand why."));
  }

  // Quote expiry countdown
  const expiry = h("div", { class: "expiry", id: "expiry" });
  root.append(expiry);
  startCountdown();

  // Verify-before-sign panel
  const txns: Txn[] = [...(quote.approvalTxns ?? []), ...(quote.swapTx ? [quote.swapTx] : [])];
  const verify = h("div", { class: "verify" });
  verify.append(h("div", { class: "verify-title" }, "Verify before signing"));
  verify.append(h("div", { class: "verify-note" },
    "These are the exact transactions you will be asked to sign in your wallet. " +
    "Confirm the chain, destination and amounts. Signatures are irreversible — " +
    "always re-check the details shown by your wallet."
  ));
  txns.forEach((t, i) => {
    const label = i < (quote!.approvalTxns?.length ?? 0) ? `Approval ${i + 1}` : "Deposit";
    const det = h("details", { class: "txn" });
    det.append(h("summary", {}, `${label} — ${chainName(t.chainId)} → ${shortAddr(t.to)}`));
    const dl = h("div", { class: "txn-body" });
    dl.append(h("div", {}, `chainId: ${t.chainId}`));
    dl.append(h("div", {}, `to: ${t.to}`));
    dl.append(h("div", {}, `value: ${t.value ?? "0"}`));
    dl.append(h("div", { class: "calldata" }, `data: ${t.data}`));
    det.append(dl);
    verify.append(det);
  });

  const confirm = h("label", { class: "confirm" }) as HTMLLabelElement;
  const cb = h("input", { type: "checkbox", id: "confirm-cb" }) as HTMLInputElement;
  confirm.append(cb, document.createTextNode(" I have verified these transaction details and want to proceed."));
  verify.append(confirm);
  root.append(verify);

  // Action button
  const btn = h("button", { class: "btn", id: "action", disabled: "true" }, "Connect wallet & sign") as HTMLButtonElement;
  cb.addEventListener("change", () => { btn.disabled = !cb.checked || quoteExpired(); });
  btn.addEventListener("click", () => { void runSwap(); });
  root.append(btn);

  $("status").className = "status info";
  setStatus("Review the quote, confirm the details, then connect your wallet.");
}

function startCountdown(): void {
  if (countdownTimer) window.clearInterval(countdownTimer);
  const tick = () => {
    const exp = quote?.quoteExpiryTimestamp;
    const node = document.getElementById("expiry");
    if (!node) return;
    if (typeof exp !== "number") { node.textContent = ""; return; }
    const secs = Math.round(exp - Date.now() / 1000);
    if (secs <= 0) {
      node.textContent = "Quote expired — request a fresh quote to continue.";
      node.className = "expiry expired";
      const btn = document.getElementById("action") as HTMLButtonElement | null;
      if (btn) btn.disabled = true;
    } else {
      node.textContent = `Quote valid for ${secs}s`;
      node.className = "expiry";
    }
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

// ─── Swap execution ──────────────────────────────────────────────────

async function getProvider(): Promise<InstanceType<typeof EthereumProvider>> {
  if (provider) return provider;
  provider = await EthereumProvider.init({
    projectId: __WC_PROJECT_ID__,
    showQrModal: true,
    optionalChains: MAINNET_CHAIN_IDS as [number, ...number[]],
    methods: ["eth_sendTransaction", "wallet_switchEthereumChain", "personal_sign", "eth_accounts", "eth_chainId"],
    events: ["chainChanged", "accountsChanged"],
  });
  return provider;
}

async function ensureChain(p: InstanceType<typeof EthereumProvider>, chainId: number): Promise<void> {
  if (p.chainId === chainId) return;
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHexQuantity(chainId) }] });
  } catch (err) {
    throw new Error(`Please switch your wallet to ${chainName(chainId)} (chainId ${chainId}) and try again.`);
  }
}

async function sendTxn(p: InstanceType<typeof EthereumProvider>, t: SwapQuote["swapTx"] | Txn): Promise<string> {
  await ensureChain(p, t!.chainId);
  const tx: Record<string, string> = { from: account!, to: t!.to, data: t!.data };
  const value = toHexQuantity(t!.value ?? "0");
  if (value) tx.value = value;
  const swapTx = t as SwapQuote["swapTx"];
  const gas = toHexQuantity(swapTx?.gas);
  const maxFee = toHexQuantity(swapTx?.maxFeePerGas);
  const maxPrio = toHexQuantity(swapTx?.maxPriorityFeePerGas);
  if (gas) tx.gas = gas;
  if (maxFee) tx.maxFeePerGas = maxFee;
  if (maxPrio) tx.maxPriorityFeePerGas = maxPrio;
  const hash = (await p.request({ method: "eth_sendTransaction", params: [tx] })) as string;
  return hash;
}

async function runSwap(): Promise<void> {
  if (!quote?.swapTx) { setStatus("No deposit transaction in this quote.", "error"); return; }
  if (quoteExpired()) { setStatus("Quote expired — request a fresh quote.", "error"); return; }
  const btn = $("action") as HTMLButtonElement;
  btn.disabled = true;

  try {
    setStatus("Connecting wallet…");
    const p = await getProvider();
    const accounts = (await p.enable()) as string[];
    account = accounts?.[0] ?? null;
    if (!account) throw new Error("No account returned from wallet.");
    setStatus(`Connected: ${shortAddr(account)}`);

    const originChainId = quote.swapTx.chainId;

    // Approvals first (USDT-style allowances can need two).
    const approvals = quote.approvalTxns ?? [];
    for (let i = 0; i < approvals.length; i++) {
      setStatus(`Sign approval ${i + 1} of ${approvals.length} in your wallet…`);
      await sendTxn(p, approvals[i]);
    }

    setStatus("Sign the deposit transaction in your wallet…");
    const depositHash = await sendTxn(p, quote.swapTx);
    setStatus(`Deposit submitted: ${shortAddr(depositHash)} — tracking fill…`, "success");
    await app.updateModelContext({
      content: [{ type: "text", text: `Across deposit submitted on ${chainName(originChainId)}: ${depositHash}. Tracking fill status.` }],
    });

    await trackUntilFilled(depositHash, originChainId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Failed: ${msg}`, "error");
    btn.disabled = false;
    await app.updateModelContext({ content: [{ type: "text", text: `Across swap failed: ${msg}` }] }).catch(() => {});
  }
}

async function trackUntilFilled(depositTxHash: string, originChainId: number): Promise<void> {
  const deadline = Date.now() + 10 * 60 * 1000; // 10 min cap
  while (Date.now() < deadline) {
    try {
      const res = await app.callServerTool({
        name: "track_deposit_app",
        arguments: { depositTxHash, originChainId },
      });
      const sc = (res.structuredContent ?? {}) as Record<string, unknown>;
      const status = String(sc.status ?? sc.fillStatus ?? "pending").toLowerCase();
      if (status.includes("fill")) {
        setStatus(`✅ Swap filled. Deposit ${shortAddr(depositTxHash)} completed on the destination chain.`, "success");
        await app.updateModelContext({ content: [{ type: "text", text: `Across swap filled. Deposit tx ${depositTxHash} on ${chainName(originChainId)} is complete.` }] });
        return;
      }
      if (status.includes("refund") || status.includes("expired")) {
        setStatus(`Deposit ${status}. Funds were not bridged; check your wallet.`, "error");
        return;
      }
      setStatus(`Bridging… current status: ${status}. (Deposit ${shortAddr(depositTxHash)})`);
    } catch {
      setStatus(`Bridging… (status check retrying for ${shortAddr(depositTxHash)})`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  setStatus(`Still pending after 10 min. Deposit ${shortAddr(depositTxHash)} — check status later.`);
}

// ─── Boot ──────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // Capture the tool result that opened this view before connecting, so the
  // SDK delivers the buffered notification to our handler.
  app.ontoolresult = (params) => {
    const sc = (params.structuredContent ?? null) as SwapQuote | null;
    if (sc && (sc.swapTx || sc.approvalTxns)) {
      quote = sc;
      renderQuote();
    }
  };

  try {
    await app.connect();
  } catch (err) {
    setStatus(`Could not connect to host: ${err instanceof Error ? err.message : String(err)}`, "error");
    return;
  }

  if (!quote) {
    setStatus("Waiting for swap quote from the server…");
  }
}

void boot();
