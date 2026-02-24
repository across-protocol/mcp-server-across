import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface DocPage {
  url: string;
  path: string;
  title: string;
  section: string;
  content: string;
  codeBlocks: string[];
  lastCrawled: string;
}

export interface StoreData {
  pages: DocPage[];
  lastFullCrawl: string;
  version: number;
}

const CACHE_DIR = join(homedir(), ".across-mcp");
const CACHE_FILE = join(CACHE_DIR, "cache.json");
const STORE_VERSION = 1;

export class DocStore {
  private pages: Map<string, DocPage> = new Map();
  private lastFullCrawl: Date | null = null;

  loadFromDisk(): boolean {
    try {
      if (!existsSync(CACHE_FILE)) return false;
      const raw = readFileSync(CACHE_FILE, "utf-8");
      const data: StoreData = JSON.parse(raw);
      if (data.version !== STORE_VERSION) return false;

      this.pages.clear();
      for (const page of data.pages) {
        this.pages.set(page.path, page);
      }
      this.lastFullCrawl = new Date(data.lastFullCrawl);
      return true;
    } catch {
      return false;
    }
  }

  saveToDisk(): void {
    try {
      if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
      }
      const data: StoreData = {
        pages: Array.from(this.pages.values()),
        lastFullCrawl: this.lastFullCrawl?.toISOString() ?? new Date().toISOString(),
        version: STORE_VERSION,
      };
      writeFileSync(CACHE_FILE, JSON.stringify(data), "utf-8");
    } catch (err) {
      console.error("Failed to save cache:", err);
    }
  }

  addPage(page: DocPage): void {
    this.pages.set(page.path, page);
  }

  getPage(path: string): DocPage | undefined {
    // Try exact match first
    if (this.pages.has(path)) return this.pages.get(path);
    // Try with/without leading slash
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (this.pages.has(normalized)) return this.pages.get(normalized);
    // Try without leading slash
    const withoutSlash = path.startsWith("/") ? path.slice(1) : path;
    if (this.pages.has(withoutSlash)) return this.pages.get(withoutSlash);
    // Fuzzy: find by partial match
    for (const [key, page] of this.pages) {
      if (key.includes(path) || page.url.includes(path)) return page;
    }
    return undefined;
  }

  getAllPages(): DocPage[] {
    return Array.from(this.pages.values());
  }

  getPagesBySection(section: string): DocPage[] {
    return Array.from(this.pages.values()).filter(
      (p) => p.section.toLowerCase() === section.toLowerCase()
    );
  }

  getCodeExamples(topic?: string): Array<{ title: string; url: string; code: string }> {
    const results: Array<{ title: string; url: string; code: string }> = [];
    for (const page of this.pages.values()) {
      if (page.codeBlocks.length === 0) continue;
      if (topic) {
        const lowerTopic = topic.toLowerCase();
        const relevant =
          page.title.toLowerCase().includes(lowerTopic) ||
          page.content.toLowerCase().includes(lowerTopic);
        if (!relevant) continue;
      }
      for (const code of page.codeBlocks) {
        results.push({ title: page.title, url: page.url, code });
      }
    }
    return results;
  }

  getLastCrawlTime(): Date | null {
    return this.lastFullCrawl;
  }

  setLastCrawlTime(time: Date): void {
    this.lastFullCrawl = time;
  }

  pageCount(): number {
    return this.pages.size;
  }

  needsRecrawl(maxAgeHours: number = 24): boolean {
    if (!this.lastFullCrawl) return true;
    const ageMs = Date.now() - this.lastFullCrawl.getTime();
    return ageMs > maxAgeHours * 60 * 60 * 1000;
  }
}
