import { promises as fs } from "fs";
import path from "path";
import type { Paper, PaperAnalysis } from "./types";

// ── GitHub source config ──
const GITHUB_OWNER = "dw-dengwei";
const GITHUB_REPO = "daily-arXiv-ai-enhanced";
const GITHUB_BRANCH = "data";
const GITHUB_PATH = "data";
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_PATH}`;
const CONTENTS_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${GITHUB_BRANCH}`;

// ── Cache for available dates ──
const DATES_CACHE_PATH = path.join(
  process.cwd(),
  "..",
  "data",
  "github_dates.json"
);
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Types ──
export interface GithubRawPaper {
  id: string;
  pdf: string;
  abs: string;
  authors: string[];
  title: string;
  categories: string[];
  summary: string;
  AI: {
    tldr: string;
    motivation: string;
    method: string;
    result: string;
    conclusion: string;
  };
}

// ── Fetch available dates ──
export async function fetchAvailableDates(): Promise<string[]> {
  // Check file cache first
  try {
    const cached = JSON.parse(await fs.readFile(DATES_CACHE_PATH, "utf-8"));
    if (cached._ts && Date.now() - cached._ts < CACHE_TTL) {
      return cached.dates;
    }
  } catch {
    // No cache yet
  }

  try {
    const res = await fetch(CONTENTS_API, {
      headers: { "User-Agent": "evil-read-arxiv/1.0" },
    });
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }
    const files: { name: string }[] = await res.json();
    const pattern = /^(\d{4}-\d{2}-\d{2})_AI_enhanced_Chinese\.jsonl$/;
    const dates: string[] = [];

    for (const f of files) {
      const m = f.name.match(pattern);
      if (m) dates.push(m[1]);
    }

    dates.sort().reverse();

    // Cache the result
    await fs.mkdir(path.dirname(DATES_CACHE_PATH), { recursive: true });
    await fs.writeFile(
      DATES_CACHE_PATH,
      JSON.stringify({ dates, _ts: Date.now() }),
      "utf-8"
    );

    return dates;
  } catch (err) {
    console.warn("Failed to fetch available history dates:", err);
    return [];
  }
}

// ── Fetch papers for a specific date ──
export async function fetchPapersFromGitHub(
  date: string
): Promise<GithubRawPaper[]> {
  const url = `${RAW_BASE}/${date}_AI_enhanced_Chinese.jsonl`;

  const res = await fetch(url, {
    headers: { "User-Agent": "evil-read-arxiv/1.0" },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No historical data for ${date}`);
    }
    throw new Error(`Failed to fetch JSONL for ${date}: HTTP ${res.status}`);
  }

  const text = await res.text();
  const papers: GithubRawPaper[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      papers.push(JSON.parse(trimmed));
    } catch {
      console.warn(`Skipping malformed JSONL line for date ${date}`);
    }
  }

  return papers;
}

// ── Map GitHub paper to app Paper type ──
export function mapGithubPaperToPaper(
  raw: GithubRawPaper,
  collectionDate: string
): Paper {
  const ai = raw.AI || ({} as GithubRawPaper["AI"]);

  // Build highlights from the AI analysis fields
  const highlights: PaperAnalysis = {
    contribution: [ai.tldr, ai.motivation].filter(Boolean).join("\n\n"),
    innovation: ai.conclusion || "",
    method: ai.method || "",
    results: ai.result || "",
  };

  return {
    arxiv_id: raw.id,
    title: raw.title,
    authors: raw.authors || [],
    affiliations: [],
    summary: ai.tldr || raw.summary,
    original_abstract: raw.summary || "",
    highlights,
    published_date: collectionDate,
    categories: raw.categories || [],
    matched_domain: "",
    matched_keywords: [],
    scores: {
      relevance: 7.0,
      recency: 7.0,
      popularity: 7.0,
      quality: 7.0,
      recommendation: 7.0,
    },
    pdf_url: raw.pdf || `https://arxiv.org/pdf/${raw.id}`,
    arxiv_url: raw.abs || `https://arxiv.org/abs/${raw.id}`,
  };
}
