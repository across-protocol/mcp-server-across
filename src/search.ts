import type { DocPage } from "./store.js";

export interface SearchResult {
  title: string;
  url: string;
  section: string;
  snippet: string;
  score: number;
}

/**
 * Simple TF-IDF text search engine.
 * No external dependencies - works with in-memory document store.
 */
export class SearchEngine {
  private documents: DocPage[] = [];
  private tokenIndex: Map<string, Set<number>> = new Map();
  private docFrequency: Map<string, number> = new Map();

  index(pages: DocPage[]): void {
    this.documents = pages;
    this.tokenIndex.clear();
    this.docFrequency.clear();

    for (let i = 0; i < pages.length; i++) {
      const tokens = this.tokenize(
        `${pages[i].title} ${pages[i].content}`
      );
      const seen = new Set<string>();

      for (const token of tokens) {
        if (!this.tokenIndex.has(token)) {
          this.tokenIndex.set(token, new Set());
        }
        this.tokenIndex.get(token)!.add(i);

        if (!seen.has(token)) {
          seen.add(token);
          this.docFrequency.set(
            token,
            (this.docFrequency.get(token) ?? 0) + 1
          );
        }
      }
    }
  }

  search(query: string, limit: number = 10): SearchResult[] {
    if (this.documents.length === 0) return [];

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores: Map<number, number> = new Map();
    const N = this.documents.length;

    for (const token of queryTokens) {
      const matchingDocs = this.tokenIndex.get(token);
      if (!matchingDocs) continue;

      const df = this.docFrequency.get(token) ?? 1;
      const idf = Math.log(1 + N / df);

      for (const docIdx of matchingDocs) {
        const doc = this.documents[docIdx];
        const text = `${doc.title} ${doc.content}`.toLowerCase();
        const tf = this.countOccurrences(text, token);
        const normalizedTf = tf / Math.sqrt(text.length);
        const score = normalizedTf * idf;

        scores.set(docIdx, (scores.get(docIdx) ?? 0) + score);
      }
    }

    // Boost exact phrase matches
    const lowerQuery = query.toLowerCase();
    for (const [docIdx, score] of scores) {
      const doc = this.documents[docIdx];
      if (doc.title.toLowerCase().includes(lowerQuery)) {
        scores.set(docIdx, score * 3);
      } else if (doc.content.toLowerCase().includes(lowerQuery)) {
        scores.set(docIdx, score * 1.5);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docIdx, score]) => {
        const doc = this.documents[docIdx];
        return {
          title: doc.title,
          url: doc.url,
          section: doc.section,
          snippet: this.extractSnippet(doc.content, queryTokens),
          score: Math.round(score * 1000) / 1000,
        };
      });
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-_]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private countOccurrences(text: string, token: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(token, pos)) !== -1) {
      count++;
      pos += token.length;
    }
    return count;
  }

  private extractSnippet(content: string, queryTokens: string[]): string {
    const lower = content.toLowerCase();
    let bestPos = 0;
    let bestScore = 0;

    // Find position with highest token density
    for (let i = 0; i < lower.length - 200; i += 50) {
      const window = lower.slice(i, i + 300);
      let score = 0;
      for (const token of queryTokens) {
        if (window.includes(token)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestPos = i;
      }
    }

    const start = Math.max(0, bestPos);
    const end = Math.min(content.length, start + 300);
    let snippet = content.slice(start, end).trim();

    if (start > 0) snippet = "..." + snippet;
    if (end < content.length) snippet = snippet + "...";

    return snippet;
  }
}
