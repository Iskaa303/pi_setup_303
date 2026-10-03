/**
 * Pure, dependency-free logic for ketch-web-access: URL filtering, passage
 * extraction, the research artifact, and content paging.
 *
 * Split out from index.ts so it can be unit-tested without loading Pi's
 * extension API. Adapted from pi-web-access (c) 2026 Nico Bailon, MIT —
 * see licenses/ in this directory.
 */

import { createHash } from "node:crypto";

export interface SearchResult {
  title?: string;
  url: string;
  fetched_url?: string;
  description?: string;
  content?: string;
  backends?: string[];
}

export interface ScrapePage {
  url: string;
  fetched_url?: string;
  title?: string;
  markdown?: string;
  raw_html?: string;
  source?: string;
}

export interface StoredPage {
  url: string;
  title?: string;
  content: string;
  error?: string;
}

export interface ResearchSource {
  rank: number;
  url: string;
  title?: string;
  snippet?: string;
  quality: "high" | "medium" | "unknown";
  fetched: boolean;
  fetch_error?: string;
  content_hash?: string;
}

export interface ResearchPassage {
  passage_id: string;
  source_url: string;
  source_rank: number;
  text: string;
  extraction_span?: { start: number; end: number };
  content_hash: string;
}

export interface ClaimAssessment {
  claim: string;
  status: "supported" | "contradicted" | "unclear" | "missing-evidence";
  supporting_passages: string[];
  contradicting_passages: string[];
  rationale: string;
  confidence: number;
}

export interface ResearchArtifact {
  id: string;
  type: "research";
  timestamp: number;
  query: string;
  provider?: string;
  sources: ResearchSource[];
  passages: ResearchPassage[];
  claims: ClaimAssessment[];
  filters: { recency?: string; domain_include: string[]; domain_exclude: string[] };
  errors?: Array<{ query: string; error: string }>;
}

export interface StoredSearch {
  id: string;
  type: "search";
  timestamp: number;
  text: string;
  queries: Array<{ query: string; results: SearchResult[] }>;
  pages: StoredPage[];
}

export interface StoredResearch {
  id: string;
  type: "research";
  timestamp: number;
  text: string;
  artifact: ResearchArtifact;
}

export type Stored = StoredSearch | StoredResearch;

// ---------------------------------------------------------------------------
// ids and hashes
// ---------------------------------------------------------------------------

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function hashContent(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// query and URL handling
// ---------------------------------------------------------------------------

export function queriesFrom(params: { query?: string; queries?: string[] }): string[] {
  const list = Array.isArray(params.queries) && params.queries.length ? params.queries : params.query ? [params.query] : [];
  return list.map((query) => query.trim()).filter(Boolean).slice(0, 8);
}

export function domainAllowed(url: string, filters: string[] | undefined): boolean {
  if (!filters?.length) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  const matches = (filter: string) => {
    const value = filter.replace(/^[-*.]/, "").toLowerCase().trim();
    return value.length > 0 && (host === value || host.endsWith(`.${value}`));
  };
  const include = filters.filter((filter) => !filter.startsWith("-"));
  const exclude = filters.filter((filter) => filter.startsWith("-"));
  if (exclude.some(matches)) return false;
  if (include.length === 0) return true;
  return include.some(matches);
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

export function formatSearchText(query: string, results: SearchResult[]): string {
  if (!results.length) return `### ${query}\n\nNo results.`;
  const lines = [`### ${query}`, ""];
  results.forEach((result, index) => {
    lines.push(`${index + 1}. [${result.title || result.url}](${result.url})`);
    if (result.description) lines.push(`   ${result.description.replace(/\s+/g, " ").trim()}`);
  });
  return lines.join("\n");
}

export function formatArtifact(artifact: ResearchArtifact): string {
  const lines = [`# Source check: ${artifact.query}`, ""];
  const claim = artifact.claims[0];
  lines.push(`**Status:** ${claim?.status ?? "unclear"} — ${claim?.rationale ?? ""}`);
  if (artifact.provider) lines.push(`**Provider:** ${artifact.provider}`);
  lines.push("", `**Sources (${artifact.sources.length})**`);
  for (const source of artifact.sources) {
    lines.push(
      `- [${source.rank}] [${source.title || source.url}](${source.url}) — quality: ${source.quality}, fetched: ${
        source.fetched ? "yes" : "no"
      }${source.fetch_error ? ` (${source.fetch_error})` : ""}`,
    );
  }
  lines.push("", `**Passages (${artifact.passages.length})**`);
  for (const passage of artifact.passages) {
    lines.push(`- \`${passage.passage_id}\` (${passage.source_url}) [${passage.content_hash}]`);
    lines.push(`  ${passage.text.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  if (artifact.errors?.length) {
    lines.push("", "**Search errors**");
    for (const error of artifact.errors) lines.push(`- ${error.query}: ${error.error}`);
  }
  lines.push("", `responseId: \`${artifact.id}\` — use get_search_content to page or search the stored artifact.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// passage extraction and claim assessment
// ---------------------------------------------------------------------------

export function claimTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9._-]{2,}/g) ?? [];
  return [...new Set(words)];
}

export function extractRelevantSpans(content: string, hint: string): Array<{ text: string; start: number; end: number }> {
  const terms = claimTerms(hint);
  if (!terms.length) return [];
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 40);
  const offsets = new Map<string, number>();
  let cursor = 0;
  for (const block of blocks) {
    const at = content.indexOf(block, cursor);
    offsets.set(block, at < 0 ? cursor : at);
    cursor = (at < 0 ? cursor : at) + block.length;
  }
  return blocks
    .map((text, index) => ({ text, index, score: terms.filter((term) => text.toLowerCase().includes(term)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((item) => {
      const start = offsets.get(item.text) ?? 0;
      const text = item.text.slice(0, 1200);
      return { text, start, end: start + text.length };
    });
}

export function classifySource(url: string): ResearchSource["quality"] {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (/\.(gov|edu)$/.test(host) || /(^|\.)(docs?|developer|spec|standards?)\./.test(host)) return "high";
  if (/\.(org|io|dev)$/.test(host)) return "medium";
  return "unknown";
}

export function assessClaim(claim: string, passages: ResearchPassage[]): ClaimAssessment {
  if (!passages.length) {
    return {
      claim,
      status: "missing-evidence",
      supporting_passages: [],
      contradicting_passages: [],
      rationale: "No passages were retrieved for the claim.",
      confidence: 0.2,
    };
  }
  return {
    claim,
    status: "unclear",
    supporting_passages: [],
    contradicting_passages: [],
    rationale:
      "Passages were retrieved, but automated semantic support or contradiction assessment is unavailable; review the cited passages manually.",
    confidence: 0.3,
  };
}

export function buildArtifact(input: {
  claim: string;
  provider?: string;
  results: SearchResult[];
  fetched: StoredPage[];
  recency?: string;
  domainFilter?: string[];
  errors: Array<{ query: string; error: string }>;
}): ResearchArtifact {
  const fetchedByUrl = new Map(input.fetched.map((page) => [page.url, page]));
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];
  for (const [index, result] of input.results.entries()) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    const page = fetchedByUrl.get(result.url);
    sources.push({
      rank: index + 1,
      url: result.url,
      title: result.title,
      snippet: result.description,
      quality: classifySource(result.url),
      fetched: Boolean(page && !page.error),
      ...(page?.error ? { fetch_error: page.error } : {}),
      ...(page && !page.error && page.content ? { content_hash: hashContent(page.content) } : {}),
    });
  }

  const passages: ResearchPassage[] = [];
  for (const source of sources) {
    if (source.snippet) {
      passages.push({
        passage_id: `p-${source.rank}-0`,
        source_url: source.url,
        source_rank: source.rank,
        text: source.snippet,
        content_hash: hashContent(source.snippet),
      });
    }
    const page = fetchedByUrl.get(source.url);
    if (!page || page.error || !page.content) continue;
    const hint = source.snippet?.trim() || input.claim;
    for (const [index, span] of extractRelevantSpans(page.content, hint).entries()) {
      passages.push({
        passage_id: `p-${source.rank}-${index + 1}`,
        source_url: source.url,
        source_rank: source.rank,
        text: span.text,
        extraction_span: { start: span.start, end: span.end },
        content_hash: hashContent(span.text),
      });
    }
  }

  const domainInclude = (input.domainFilter ?? []).filter((filter) => !filter.startsWith("-"));
  const domainExclude = (input.domainFilter ?? []).filter((filter) => filter.startsWith("-")).map((filter) => filter.slice(1));

  return {
    id: newId("kwa"),
    type: "research",
    timestamp: Date.now(),
    query: input.claim,
    ...(input.provider ? { provider: input.provider } : {}),
    sources,
    passages,
    claims: [assessClaim(input.claim, passages)],
    filters: {
      ...(input.recency ? { recency: input.recency } : {}),
      domain_include: domainInclude,
      domain_exclude: domainExclude,
    },
    ...(input.errors.length ? { errors: input.errors } : {}),
  };
}

// ---------------------------------------------------------------------------
// URL shapes that fetch_content special-cases
// ---------------------------------------------------------------------------

const GITHUB_REPO = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/;

export function githubSlug(url: string): string | undefined {
  const match = GITHUB_REPO.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : undefined;
}

const VIDEO_URL = /(\.mp4|\.mov|\.webm|\.mkv)(\?|#|$)|youtube\.com\/(watch|shorts|embed)|youtu\.be\//i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_URL.test(url);
}

// ---------------------------------------------------------------------------
// findText pinned to a character offset, so callers can report location
// ---------------------------------------------------------------------------

export function normalizeForMode(text: string, mode: string): string {
  if (mode === "exact") return text;
  if (mode === "whitespace-insensitive") return text.toLowerCase().replace(/\s+/g, " ");
  return text.toLowerCase();
}

export function findInContent(
  content: string,
  needles: string[],
  mode: string,
  window = 300,
): Array<{ needle: string; index: number; excerpt: string } | { needle: string; missing: true }> {
  const haystack = normalizeForMode(content, mode);
  return needles.map((needle) => {
    const index = haystack.indexOf(normalizeForMode(needle, mode));
    if (index < 0) return { needle, missing: true as const };
    const start = Math.max(0, index - window);
    const end = Math.min(content.length, index + needle.length + window);
    return { needle, index, excerpt: `…${content.slice(start, end)}…` };
  });
}
