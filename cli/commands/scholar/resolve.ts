import { type Hit, searchKnows, searchOpenAlex, searchS2 } from "./api.js";
import {
  queryToTitleSimilarity,
  titleToTitleSimilarity,
} from "./similarity.js";

export interface ResolveResult {
  query: string;
  knowsAcademy: (Hit & { query_match_score: number }) | null;
  openalex: (Hit & { query_match_score: number }) | null;
  semanticscholar: (Hit & { query_match_score: number }) | null;
  cross_source_similarity: number;
  recommendation: string;
}

const SAME_PAPER_THRESHOLD = 0.7;

function scored(
  query: string,
  hit: Hit | null,
): (Hit & { query_match_score: number }) | null {
  return hit
    ? {
        ...hit,
        query_match_score: queryToTitleSimilarity(query, hit.title ?? ""),
      }
    : null;
}

export async function runResolve(query: string): Promise<ResolveResult> {
  const [knows, oa, s2] = await Promise.all([
    searchKnows(query, 5),
    searchOpenAlex(query, { maxResults: 5 }),
    searchS2(query, { maxResults: 5 }),
  ]);
  const knowsTop = knows[0] ?? null;
  const oaTop = oa[0] ?? null;
  const s2Top = s2[0] ?? null;

  const cross =
    knowsTop && oaTop
      ? titleToTitleSimilarity(knowsTop.title ?? "", oaTop.title ?? "")
      : 0;

  let recommendation: string;
  if (knowsTop && oaTop && cross >= SAME_PAPER_THRESHOLD) {
    recommendation = `use knows.academy sidecar (cross-source match ${cross.toFixed(2)}; same paper, rich structure)`;
  } else if (oaTop) {
    recommendation = `use openalex (knows.academy top hit looks like a different paper, cross-sim ${cross.toFixed(2)}) — fetch abstract and run Mode 1 Generate locally for a sidecar`;
  } else if (s2Top) {
    recommendation =
      "use semanticscholar (only metadata source with hits) — TL;DR/abstract can seed Mode 1 Generate";
  } else if (knowsTop) {
    recommendation =
      "use knows.academy (only source with hits — verify it's the right paper)";
  } else {
    recommendation = "no match in any source";
  }

  return {
    query,
    knowsAcademy: scored(query, knowsTop),
    openalex: scored(query, oaTop),
    semanticscholar: scored(query, s2Top),
    cross_source_similarity: cross,
    recommendation,
  };
}
