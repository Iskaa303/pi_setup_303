// Run: node --experimental-strip-types --test test/logic.test.ts
// (or: npm test)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildArtifact,
  domainAllowed,
  extractRelevantSpans,
  findInContent,
  formatSearchText,
  githubSlug,
  hashContent,
  isVideoUrl,
  queriesFrom,
  vttToText,
} from "../logic.ts";

test("queriesFrom prefers queries, dedupes empties, caps at 8", () => {
  assert.deepEqual(queriesFrom({ query: "one" }), ["one"]);
  assert.deepEqual(queriesFrom({ query: "one", queries: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(queriesFrom({ queries: [" a ", "", "  "] }), ["a"]);
  assert.equal(queriesFrom({ queries: Array.from({ length: 12 }, (_, i) => `q${i}`) }).length, 8);
  assert.deepEqual(queriesFrom({}), []);
});

test("domainAllowed handles include, exclude, subdomains, and bad urls", () => {
  assert.equal(domainAllowed("https://docs.python.org/3/", undefined), true);
  assert.equal(domainAllowed("https://docs.python.org/3/", ["python.org"]), true);
  assert.equal(domainAllowed("https://docs.python.org/3/", ["docs.python.org"]), true);
  assert.equal(domainAllowed("https://example.com/a", ["python.org"]), false);
  assert.equal(domainAllowed("https://example.com/a", ["-example.com"]), false);
  assert.equal(domainAllowed("https://ok.com/a", ["example.com", "-bad.com"]), false);
  assert.equal(domainAllowed("not a url", ["example.com"]), true);
});

test("extractRelevantSpans ranks by claim-term overlap and reports offsets", () => {
  const content = [
    "Unrelated filler paragraph that is long enough to survive the length filter.",
    "The benchmark measured throughput at 1200 requests per second on the reference hardware.",
    "Another unrelated paragraph, also long enough to survive the length filter here.",
    "Throughput dropped to 300 requests per second once logging was enabled in the benchmark.",
  ].join("\n\n");
  const spans = extractRelevantSpans(content, "benchmark throughput requests per second");
  assert.equal(spans.length, 2);
  assert.match(spans[0].text, /requests per second/);
  for (const span of spans) {
    assert.equal(content.slice(span.start, span.start + span.text.length), span.text);
    assert.equal(span.end - span.start, span.text.length);
  }
});

test("findInContent locates needles and honors mode", () => {
  const content = "Alpha beta GAMMA delta.";
  const [ci] = findInContent(content, ["gamma"], "case-insensitive");
  assert.ok(!("missing" in ci) && ci.index === 11);
  const [exact] = findInContent(content, ["gamma"], "exact");
  assert.ok("missing" in exact);
  const [ws] = findInContent(content, ["Alpha   beta"], "whitespace-insensitive");
  assert.ok(!("missing" in ws) && ws.index === 0);
});

test("buildArtifact produces sources, passages, hashes, and an honest assessment", () => {
  const artifact = buildArtifact({
    claim: "Ketch is fast",
    provider: "searxng",
    results: [
      { url: "https://example.com/one", title: "One", description: "Ketch benchmark" },
      { url: "https://example.com/two", title: "Two", description: "Ketch benchmark" },
      { url: "https://example.com/one", title: "Dup", description: "dup" },
    ],
    fetched: [
      {
        url: "https://example.com/one",
        content: "Intro paragraph long enough to pass the length filter for spans.\n\nKetch is fast for scrape operations.",
      },
      { url: "https://example.com/two", content: "", error: "boom" },
    ],
    domainFilter: ["example.com", "-skip.example.com"],
    errors: [],
  });

  assert.equal(artifact.sources.length, 2, "duplicate URLs collapse");
  assert.equal(artifact.sources[0].fetched, true);
  assert.equal(artifact.sources[1].fetch_error, "boom");
  assert.match(artifact.sources[0].content_hash ?? "", /^sha256:[0-9a-f]{16}$/);
  assert.ok(artifact.passages.length >= 2, "snippets plus at least one fetched span");
  assert.deepEqual(artifact.filters, { domain_include: ["example.com"], domain_exclude: ["skip.example.com"] });
  assert.equal(artifact.claims[0].status, "unclear");
  assert.equal(artifact.claims[0].supporting_passages.length, 0);
});

test("buildArtifact reports missing-evidence when nothing was retrieved", () => {
  const artifact = buildArtifact({ claim: "nothing", results: [], fetched: [], errors: [] });
  assert.equal(artifact.claims[0].status, "missing-evidence");
  assert.equal(artifact.sources.length, 0);
});

test("githubSlug and isVideoUrl pick out the special-cased URLs", () => {
  assert.equal(githubSlug("https://github.com/nicobailon/pi-web-access"), "nicobailon/pi-web-access");
  assert.equal(githubSlug("https://github.com/owner/repo.git"), "owner/repo");
  assert.equal(githubSlug("https://github.com/owner/repo/tree/main/src"), "owner/repo");
  assert.equal(githubSlug("https://gitlab.com/owner/repo"), undefined);
  assert.equal(githubSlug("https://github.com/owner"), undefined);

  assert.equal(isVideoUrl("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(isVideoUrl("https://youtu.be/abc"), true);
  assert.equal(isVideoUrl("/tmp/screen.mp4"), true);
  assert.equal(isVideoUrl("https://example.com/guide.html"), false);
});

test("vttToText strips WebVTT markup, timing marks and rolling duplicates", () => {
  const vtt = [
    "WEBVTT",
    "Kind: captions",
    "Language: en",
    "",
    "1",
    "00:00:00.000 --> 00:00:02.000 align:start position:0%",
    "Welcome<00:00:00.500><c> back</c>.",
    "",
    "2",
    "00:00:02.000 --> 00:00:04.000 align:start position:0%",
    "Welcome back.",
    "",
    "3",
    "00:00:04.000 --> 00:00:06.000",
    "For those that are new,",
  ].join("\n");

  assert.equal(vttToText(vtt), "[00:00] Welcome back.\n[00:04] For those that are new,");
  assert.equal(vttToText(vtt, { timestamps: false }), "Welcome back.\nFor those that are new,");
  assert.equal(vttToText(""), "");
});

test("vttToText keeps the timestamp that a moment can be found by", () => {
  const vtt = ["WEBVTT", "", "00:07:55.000 --> 00:07:58.000", "The interesting bit", "", "00:09:00.000 --> 00:09:02.000", "Something else"].join("\n");
  const text = vttToText(vtt);
  assert.match(text, /^\[07:55\] The interesting bit$/m);
  assert.match(text, /^\[09:00\] Something else$/m);
  // This is what makes "what happens at 7:57" answerable without a parser.
  assert.ok(text.includes("[07:55]"), "a cue near 7:57 must carry its time");
});

test("formatSearchText links every result or says so", () => {
  assert.equal(formatSearchText("q", []), "### q\n\nNo results.");
  const text = formatSearchText("q", [{ url: "https://a.test", title: "A", description: "line\nbreak" }]);
  assert.match(text, /\[A\]\(https:\/\/a\.test\)/);
  assert.match(text, /line break/);
});
