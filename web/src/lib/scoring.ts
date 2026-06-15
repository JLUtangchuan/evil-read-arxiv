/**
 * Paper scoring engine — mirrors start-my-day/scripts/search_arxiv.py
 * Applies the same 4-dimensional scoring to historical (GitHub JSONL) papers.
 */

import type { Paper, ResearchConfig } from "./types";

// ── Constants (mirrors search_arxiv.py) ──
const SCORE_MAX = 3.0;
const TITLE_BOOST = 0.5;
const SUMMARY_BOOST = 0.3;
const CATEGORY_BOOST = 1.0;

const RECENCY_THRESHOLDS: [number, number][] = [
  [30, 3.0],
  [90, 2.0],
  [180, 1.0],
];

const WEIGHTS = { relevance: 0.4, recency: 0.2, popularity: 0.3, quality: 0.1 };

// ── Quality heuristic keywords ──
const STRONG_INNOVATION = [
  "state-of-the-art", "sota", "breakthrough", "first",
  "surpass", "outperform", "pioneering",
];
const WEAK_INNOVATION = [
  "novel", "propose", "introduce", "new approach",
  "new method", "innovative",
];
const METHOD_INDICATORS = [
  "framework", "architecture", "algorithm", "mechanism",
  "pipeline", "end-to-end",
];
const QUANTITATIVE = [
  "outperforms", "improves by", "achieves", "accuracy",
  "f1", "bleu", "rouge", "beats", "surpasses",
];
const EXPERIMENT = [
  "experiment", "evaluation", "benchmark", "ablation",
  "baseline", "comparison",
];

// ── Scoring functions ──

export function scoreRelevance(
  title: string,
  abstract: string,
  categories: string[],
  config: ResearchConfig
): { score: number; domain: string; keywords: string[] } {
  const domains = config.research_domains || {};
  const excluded = (config.excluded_keywords || []).map((k) => k.toLowerCase());
  const negative = (config.negative_keywords || []).map((k) => k.toLowerCase());
  const titleLower = title.toLowerCase();
  const summaryLower = abstract.toLowerCase();
  const catSet = new Set(categories);

  // Exclude check — still completely removes paper
  for (const kw of excluded) {
    if (titleLower.includes(kw) || summaryLower.includes(kw)) {
      return { score: 0, domain: "", keywords: [] };
    }
  }

  let maxScore = 0;
  let bestDomain = "";
  let bestKeywords: string[] = [];

  for (const [domainName, domainCfg] of Object.entries(domains)) {
    let score = 0;
    const matched: string[] = [];

    for (const kw of domainCfg.keywords || []) {
      const kl = kw.toLowerCase();
      if (titleLower.includes(kl)) {
        score += TITLE_BOOST;
        matched.push(kw);
      } else if (summaryLower.includes(kl)) {
        score += SUMMARY_BOOST;
        matched.push(kw);
      }
    }

    for (const cat of domainCfg.arxiv_categories || []) {
      if (catSet.has(cat)) {
        score += CATEGORY_BOOST;
        matched.push(cat);
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestDomain = domainName;
      bestKeywords = matched;
    }
  }

  // Negative keyword penalty: -3x normal boost per match
  let penalty = 0;
  for (const nk of negative) {
    if (titleLower.includes(nk)) {
      penalty += TITLE_BOOST * 3;
    } else if (summaryLower.includes(nk)) {
      penalty += SUMMARY_BOOST * 3;
    }
  }
  maxScore = Math.max(0, maxScore - penalty);

  return { score: maxScore, domain: bestDomain, keywords: bestKeywords };
}

export function scoreRecency(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  const daysAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  for (const [maxDays, pts] of RECENCY_THRESHOLDS) {
    if (daysAgo <= maxDays) return pts;
  }
  return 0;
}

export function scoreQuality(summary: string): number {
  if (!summary) return 0;
  const s = summary.toLowerCase();
  let score = 0;

  const strong = STRONG_INNOVATION.filter((w) => s.includes(w)).length;
  if (strong >= 2) score += 1.0;
  else if (strong === 1) score += 0.7;
  else if (WEAK_INNOVATION.some((w) => s.includes(w))) score += 0.3;

  if (METHOD_INDICATORS.some((w) => s.includes(w))) score += 0.5;
  if (QUANTITATIVE.some((w) => s.includes(w))) score += 0.8;
  else if (EXPERIMENT.some((w) => s.includes(w))) score += 0.4;

  return Math.min(score, SCORE_MAX);
}

export function scorePaper(
  paper: Paper,
  config: ResearchConfig
): Paper {
  const abstract = paper.original_abstract || paper.summary || "";

  // Relevance
  const rel = scoreRelevance(paper.title, abstract, paper.categories, config);

  // Recency
  const rec = scoreRecency(paper.published_date);

  // Popularity — historical papers have no citation data, default 0
  const pop = 0;

  // Quality
  const qual = scoreQuality(abstract);

  // Final recommendation score
  const normalized = {
    relevance: (rel.score / SCORE_MAX) * 10,
    recency: (rec / SCORE_MAX) * 10,
    popularity: (pop / SCORE_MAX) * 10,
    quality: (qual / SCORE_MAX) * 10,
  };
  const recommendation = Math.round(
    (normalized.relevance * WEIGHTS.relevance +
      normalized.recency * WEIGHTS.recency +
      normalized.popularity * WEIGHTS.popularity +
      normalized.quality * WEIGHTS.quality) * 100
  ) / 100;

  return {
    ...paper,
    matched_domain: rel.domain || paper.matched_domain,
    matched_keywords: rel.keywords.length > 0 ? rel.keywords : paper.matched_keywords,
    scores: {
      relevance: Math.round(rel.score * 100) / 100,
      recency: Math.round(rec * 100) / 100,
      popularity: pop,
      quality: Math.round(qual * 100) / 100,
      recommendation,
    },
  };
}

/**
 * Score an array of papers, filter out irrelevant ones (relevance=0),
 * sort by recommendation score descending, and return top N.
 * Mirrors the Python filter_and_score_papers behavior.
 */
export function scoreAndRank(
  papers: Paper[],
  config: ResearchConfig,
  limit: number = 50
): Paper[] {
  return papers
    .map((p) => scorePaper(p, config))
    .filter((p) => p.scores.relevance > 0)        // exclude irrelevant
    .sort((a, b) => b.scores.recommendation - a.scores.recommendation)
    .slice(0, limit);
}
