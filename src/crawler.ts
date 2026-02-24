import * as htmlparser2 from "htmlparser2";
import { getText, getElementsByTagName, getChildren, textContent } from "domutils";
import type { Element, ChildNode } from "domhandler";
import { KNOWN_URLS, type DocUrl } from "./data/known-urls.js";
import { DocStore, type DocPage } from "./store.js";

const RATE_LIMIT_MS = 600;
const REQUEST_TIMEOUT_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "AcrossMCPServer/1.0 (documentation-indexer)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    return null;
  }
}

function getTagName(node: ChildNode): string | undefined {
  if (node.type === "tag" || node.type === "script" || node.type === "style") {
    return (node as Element).tagName?.toLowerCase();
  }
  return undefined;
}

function extractContent(html: string, docUrl: DocUrl): Omit<DocPage, "lastCrawled"> {
  const dom = htmlparser2.parseDocument(html);

  const codeBlocks: string[] = [];
  const contentParts: string[] = [];

  // Tags to skip entirely
  const skipTags = new Set(["script", "style", "nav", "footer", "header", "svg", "noscript"]);

  function findMainContent(nodes: ChildNode[]): ChildNode[] {
    // Try to find <main>, <article>, or role="main"
    for (const node of nodes) {
      const tag = getTagName(node);
      if (tag === "main" || tag === "article") {
        return getChildren(node);
      }
      if (node.type === "tag" && (node as Element).attribs?.role === "main") {
        return getChildren(node);
      }
      if (node.type === "tag") {
        const found = findMainContent(getChildren(node));
        if (found.length > 0) return found;
      }
    }
    return [];
  }

  let mainNodes = findMainContent(dom.children as ChildNode[]);
  if (mainNodes.length === 0) {
    // Fallback to body
    const bodies = getElementsByTagName("body", dom, true);
    mainNodes = bodies.length > 0 ? getChildren(bodies[0]) : (dom.children as ChildNode[]);
  }

  function walk(nodes: ChildNode[]): void {
    for (const node of nodes) {
      const tag = getTagName(node);

      if (tag && skipTags.has(tag)) continue;

      if (tag === "h1") contentParts.push(`# ${textContent(node).trim()}`);
      else if (tag === "h2") contentParts.push(`## ${textContent(node).trim()}`);
      else if (tag === "h3") contentParts.push(`### ${textContent(node).trim()}`);
      else if (tag === "h4") contentParts.push(`#### ${textContent(node).trim()}`);
      else if (tag === "pre") {
        const code = textContent(node).trim();
        if (code.length > 10) {
          codeBlocks.push(code);
          contentParts.push("```\n" + code + "\n```");
        }
      } else if (tag === "code" && getTagName(node.parentNode as ChildNode) !== "pre") {
        // Inline code — skip standalone processing, parent handles
      } else if (tag === "p") {
        const text = textContent(node).trim();
        if (text) contentParts.push(text);
      } else if (tag === "li") {
        contentParts.push(`- ${textContent(node).trim()}`);
      } else if (tag === "blockquote") {
        contentParts.push(`> ${textContent(node).trim()}`);
      } else if (tag === "table") {
        const rows = getElementsByTagName("tr", node, true);
        for (const row of rows) {
          const cells = [...getElementsByTagName("th", row, true), ...getElementsByTagName("td", row, true)];
          const cellTexts = cells.map((c) => textContent(c).trim());
          contentParts.push(cellTexts.join(" | "));
        }
      } else if (node.type === "tag") {
        walk(getChildren(node));
      }
    }
  }

  walk(mainNodes);

  let content = contentParts.join("\n\n");

  // Fallback if we extracted very little
  if (content.trim().length < 50) {
    content = getText(dom).replace(/\s+/g, " ").trim();
  }

  // Extract title
  const h1s = getElementsByTagName("h1", dom, true);
  const titles = getElementsByTagName("title", dom, true);
  const title =
    (h1s.length > 0 ? textContent(h1s[0]).trim() : "") ||
    (titles.length > 0 ? textContent(titles[0]).trim() : "") ||
    docUrl.title;

  const path = new URL(docUrl.url).pathname || "/";

  return {
    url: docUrl.url,
    path,
    title,
    section: docUrl.section,
    content,
    codeBlocks,
  };
}

export async function crawlDocs(
  store: DocStore,
  onProgress?: (current: number, total: number, url: string) => void
): Promise<number> {
  const total = KNOWN_URLS.length;
  let crawled = 0;

  for (let i = 0; i < KNOWN_URLS.length; i++) {
    const docUrl = KNOWN_URLS[i];
    onProgress?.(i + 1, total, docUrl.url);

    const html = await fetchPage(docUrl.url);
    if (html) {
      const pageData = extractContent(html, docUrl);
      store.addPage({
        ...pageData,
        lastCrawled: new Date().toISOString(),
      });
      crawled++;
    }

    if (i < KNOWN_URLS.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  store.setLastCrawlTime(new Date());
  store.saveToDisk();

  return crawled;
}
