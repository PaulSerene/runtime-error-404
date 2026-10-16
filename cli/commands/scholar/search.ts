import { type Hit, searchKnows, searchOpenAlex, searchS2 } from "./api.js";

export interface SearchResult {
  query: string;
  primary: "knows.academy";
  fallback: "openalex" | "semanticscholar" | null;
  results: Hit[];
}

export async function runSearch({
  query,
  max = 10,
  yearMin,
  alwaysFallback = false,
}: {
  query: string;
  max?: number;
  yearMin?: number;
  alwaysFallback?: boolean;
}): Promise<SearchResult> {
  const knowsHits = await searchKnows(query, max);
  let oaHits: Hit[] = [];
  let s2Hits: Hit[] = [];
  if (knowsHits.length === 0 || alwaysFallback) {
    oaHits = await searchOpenAlex(query, { yearMin, maxResults: max });
    // Tier-3: Semantic Scholar, when OpenAlex also came up empty (or the
    // caller asked for every source). Adds TL;DR + citation counts.
    if (oaHits.length === 0 || alwaysFallback) {
      s2Hits = await searchS2(query, { yearMin, maxResults: max });
    }
  }
  return {
    query,
    primary: "knows.academy",
    fallback:
      oaHits.length > 0
        ? "openalex"
        : s2Hits.length > 0
          ? "semanticscholar"
          : null,
    results: [...knowsHits, ...oaHits, ...s2Hits],
  };
}
