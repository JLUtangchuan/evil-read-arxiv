"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useLanguage } from "@/components/LanguageContext";
import type { CitationPaper } from "@/lib/citations-bridge";
import type { CitationCacheEntry } from "@/lib/data";

function arxivUrl(paper: { externalIds?: { ArXiv?: string } }): string | null {
  const id = paper?.externalIds?.ArXiv;
  if (!id) return null;
  return `https://arxiv.org/abs/${id}`;
}

function hjfyUrl(paper: { externalIds?: { ArXiv?: string } }): string | null {
  const id = paper?.externalIds?.ArXiv;
  if (!id) return null;
  return `https://hjfy.top/arxiv/${id}`;
}

type SortKey = "citations-desc" | "citations-asc" | "year-desc" | "year-asc";

interface SearchResult {
  paper: {
    title: string;
    year: number | null;
    citationCount: number;
    paperId: string;
    externalIds: Record<string, string>;
    url: string;
  };
  citations: CitationPaper[];
  totalCitations: number;
  filteredCount: number;
  cached?: boolean;
  cachedAt?: string;
}

// ── Citation Range Slider ──

function CitationRangeSlider({
  min,
  max,
  rangeMin,
  rangeMax,
  onChange,
  count,
}: {
  min: number;
  max: number;
  rangeMin: number;
  rangeMax: number;
  onChange: (min: number, max: number) => void;
  count: number;
}) {
  const step = Math.max(1, Math.floor((max - min) / 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
        <span>0</span>
        <span>
          {rangeMin} – {rangeMax}
        </span>
        <span>{max}</span>
      </div>
      <div className="relative h-2 bg-[var(--bg-primary)] rounded-full border border-[var(--border)]">
        <div
          className="absolute h-full rounded-full bg-[var(--accent-orange)]/30"
          style={{
            left: `${max > 0 ? (rangeMin / max) * 100 : 0}%`,
            width: `${max > 0 ? ((rangeMax - rangeMin) / max) * 100 : 100}%`,
          }}
        />
      </div>
      <div className="relative h-6">
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={rangeMin}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(v, Math.max(v, rangeMax));
          }}
          className="absolute w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-orange)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--bg-card)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
        />
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={rangeMax}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(Math.min(v, rangeMin), v);
          }}
          className="absolute w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-orange)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--bg-card)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
        />
      </div>
      <p className="text-[10px] text-[var(--text-secondary)] text-right">
        {count} papers in range
      </p>
    </div>
  );
}

// ── Year Multi-Select ──

function YearSelector({
  yearCounts,
  selectedYears,
  onToggle,
  onSelectAll,
  onClear,
}: {
  yearCounts: Map<number, number>;
  selectedYears: Set<number>;
  onToggle: (year: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const years = Array.from(yearCounts.entries()).sort((a, b) => b[0] - a[0]);
  if (years.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[var(--text-secondary)]">
          {selectedYears.size === 0 || selectedYears.size === years.length
            ? `${years.length} years`
            : `${selectedYears.size} selected`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-[10px] text-[var(--accent-blue)] hover:underline"
          >
            All
          </button>
          <button
            onClick={onClear}
            className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-red)]"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {years.map(([year, count]) => {
          const active = selectedYears.size === 0 || selectedYears.has(year);
          return (
            <button
              key={year}
              onClick={() => onToggle(year)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                active
                  ? "bg-[var(--accent-purple)]/20 border-[var(--accent-purple)] text-[var(--accent-purple)]"
                  : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] opacity-50"
              }`}
            >
              {year}
              <span className="ml-1 opacity-60">({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Panel (Cool Papers + HJFY) ──

function CitationDetail({
  paper,
  onClose,
  isFavorite,
  onToggleFavorite,
  t,
}: {
  paper: CitationPaper;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [kimiHtml, setKimiHtml] = useState<string | null>(null);
  const [loadingKimi, setLoadingKimi] = useState(false);
  const [showKimi, setShowKimi] = useState(false);

  const arxivId = paper.externalIds?.ArXiv || "";

  const handleCoolPapers = useCallback(() => {
    if (kimiHtml) {
      setShowKimi(true);
      return;
    }
    setShowKimi(true);
    setLoadingKimi(true);
    fetch(`/api/papers/${encodeURIComponent(arxivId)}/kimi`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => setKimiHtml(html))
      .catch((err) => console.error("Kimi summary failed:", err))
      .finally(() => setLoadingKimi(false));
  }, [arxivId, kimiHtml]);

  return (
    <div className="h-full flex flex-col">
      {/* Header with close */}
      <div className="flex items-start justify-between gap-2 flex-shrink-0 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)] leading-snug">
            {paper.title || t("citations.untitled")}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {paper.authors.slice(0, 5).join(", ")}
            {paper.authors.length > 5 ? " et al." : ""}
          </p>
          {paper.venue && (
            <p className="text-[11px] text-[var(--text-secondary)]/70 mt-0.5">
              {paper.venue}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-sm"
        >
          ✕
        </button>
      </div>

      {/* Meta badges */}
      <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
        {paper.year && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)]">
            📅 {paper.year}
          </span>
        )}
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]">
          📊 {paper.citationCount}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4 flex-shrink-0 flex-wrap">
        {arxivId && (
          <>
            <a
              href={`https://arxiv.org/abs/${arxivId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-[100px] text-center px-3 py-2 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 text-[var(--accent-blue)] text-xs font-medium hover:bg-[var(--accent-blue)]/20 transition-colors"
            >
              📄 arXiv
            </a>
            <a
              href={`https://hjfy.top/arxiv/${arxivId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-[100px] text-center px-3 py-2 rounded-lg bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-[var(--accent-green)] text-xs font-medium hover:bg-[var(--accent-green)]/20 transition-colors"
            >
              🌐 HJFY 中文版
            </a>
            <button
              onClick={onToggleFavorite}
              className={`flex-1 min-w-[100px] text-center px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                isFavorite
                  ? "bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/30 text-[var(--accent-orange)]"
                  : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--accent-orange)]/10 hover:border-[var(--accent-orange)]/30 hover:text-[var(--accent-orange)]"
              }`}
            >
              {isFavorite ? "⭐ 已收藏" : "☆ 收藏"}
            </button>
          </>
        )}
      </div>

      {/* Cool Papers Kimi */}
      {!showKimi ? (
        <button
          onClick={handleCoolPapers}
          disabled={!arxivId}
          className="w-full py-2.5 rounded-lg border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-xs font-medium hover:bg-[var(--accent-purple)]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 flex-shrink-0"
        >
          <span>🧠</span>
          {t("citations.coolPapers")}
        </button>
      ) : loadingKimi ? (
        <div className="text-center text-xs text-[var(--text-secondary)] py-4 flex-shrink-0">
          {t("citations.loadingCoolPapers")}
        </div>
      ) : kimiHtml ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div
            className="kimi-content bg-[var(--bg-secondary)] rounded-lg p-3 text-sm leading-relaxed text-[var(--text-primary)]"
            dangerouslySetInnerHTML={{ __html: kimiHtml }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ── Main Page ──

export default function CitationsPage() {
  const { t } = useLanguage();

  // Search
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);

  // Filters — client side
  const [textFilter, setTextFilter] = useState("");
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [citRangeMin, setCitRangeMin] = useState(0);
  const [citRangeMax, setCitRangeMax] = useState(Infinity);
  const [sortKey, setSortKey] = useState<SortKey>("citations-desc");

  // Detail panel
  const [selectedCitation, setSelectedCitation] = useState<CitationPaper | null>(null);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  const toggleFavorite = useCallback((arxivId: string, title?: string) => {
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (next.has(arxivId)) {
        next.delete(arxivId);
      } else {
        next.add(arxivId);
        fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            arxiv_id: arxivId,
            title: title || "",
            rating: "like",
            date: new Date().toISOString().slice(0, 10),
            domain: "引用搜索",
            keywords: [],
            categories: [],
          }),
        }).catch(() => {});
      }
      return next;
    });
  }, []);

  // Matched paper Cool Papers
  const [matchedKimiHtml, setMatchedKimiHtml] = useState<string | null>(null);
  const [loadingMatchedKimi, setLoadingMatchedKimi] = useState(false);
  const [showMatchedKimi, setShowMatchedKimi] = useState(false);

  // History
  const [history, setHistory] = useState<CitationCacheEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/citations/history");
      if (res.ok) setHistory(await res.json());
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Derived: year distribution ──
  const yearCounts = useMemo(() => {
    if (!result) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const c of result.citations) {
      if (c.year != null) {
        map.set(c.year, (map.get(c.year) || 0) + 1);
      }
    }
    return map;
  }, [result]);

  // ── Derived: citation stats ──
  const citStats = useMemo(() => {
    if (!result || result.citations.length === 0) return { min: 0, max: 0 };
    const vals = result.citations.map((c) => c.citationCount);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [result]);

  // Reset range when new results arrive
  useEffect(() => {
    if (result) {
      setCitRangeMin(0);
      setCitRangeMax(citStats.max);
      setSelectedCitation(null);
      setMatchedKimiHtml(null);
      setShowMatchedKimi(false);
    }
  }, [result, citStats.max]);

  // ── Filtered + sorted results ──
  const filtered = useMemo(() => {
    if (!result) return [];
    let list = [...result.citations];

    const q = textFilter.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const titleMatch = (c.title || "").toLowerCase().includes(q);
        const authorMatch = c.authors.join(" ").toLowerCase().includes(q);
        return titleMatch || authorMatch;
      });
    }

    if (selectedYears.size > 0) {
      list = list.filter((c) => c.year != null && selectedYears.has(c.year));
    }

    if (citRangeMin > 0 || citRangeMax < citStats.max) {
      list = list.filter(
        (c) => c.citationCount >= citRangeMin && c.citationCount <= citRangeMax
      );
    }

    switch (sortKey) {
      case "citations-desc":
        list.sort((a, b) => b.citationCount - a.citationCount);
        break;
      case "citations-asc":
        list.sort((a, b) => a.citationCount - b.citationCount);
        break;
      case "year-desc":
        list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        break;
      case "year-asc":
        list.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
        break;
    }

    return list;
  }, [result, textFilter, selectedYears, citRangeMin, citRangeMax, sortKey, citStats.max]);

  // ── API call ──
  const doSearch = useCallback(
    async (searchTitle: string, paperId?: string) => {
      if (!searchTitle.trim() && !paperId) return;
      setLoading(true);
      setError("");
      setResult(null);
      setCachedAt(null);
      setTextFilter("");
      setSelectedYears(new Set());
      setSelectedCitation(null);
      setMatchedKimiHtml(null);
      setShowMatchedKimi(false);

      try {
        let res: Response;
        if (paperId) {
          res = await fetch(
            `/api/citations/cached?paperId=${encodeURIComponent(paperId)}`
          );
        } else {
          res = await fetch(
            `/api/citations?title=${encodeURIComponent(searchTitle.trim())}&maxResults=500`
          );
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        setResult(data);
        setActivePaperId(data.paper.paperId);
        if (data.cached) setCachedAt(data.cachedAt);
        fetchHistory();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [fetchHistory]
  );

  const handleSearch = useCallback(() => {
    if (!title.trim()) return;
    setActivePaperId(null);
    doSearch(title.trim());
  }, [title, doSearch]);

  const handleHistoryClick = useCallback(
    (entry: CitationCacheEntry) => {
      setTitle(entry.title);
      setActivePaperId(entry.paperId);
      doSearch("", entry.paperId);
    },
    [doSearch]
  );

  const handleDeleteHistory = useCallback(
    async (paperId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await fetch(
          `/api/citations/history?paperId=${encodeURIComponent(paperId)}`,
          { method: "DELETE" }
        );
        setHistory((prev) => prev.filter((h) => h.paperId !== paperId));
        if (activePaperId === paperId) {
          setResult(null);
          setActivePaperId(null);
        }
      } catch {
        // silent
      }
    },
    [activePaperId]
  );

  // Matched paper Cool Papers handler
  const handleMatchedCoolPapers = useCallback(() => {
    if (!result) return;
    if (matchedKimiHtml) {
      setShowMatchedKimi(true);
      return;
    }
    const arxivId = result.paper.externalIds?.ArXiv;
    if (!arxivId) return;
    setShowMatchedKimi(true);
    setLoadingMatchedKimi(true);
    fetch(`/api/papers/${encodeURIComponent(arxivId)}/kimi`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => setMatchedKimiHtml(html))
      .catch((err) => console.error("Kimi summary failed:", err))
      .finally(() => setLoadingMatchedKimi(false));
  }, [result, matchedKimiHtml]);

  // ── History Sidebar ──
  const renderHistorySidebar = () => (
    <div className="hidden lg:flex lg:flex-col lg:w-[260px] xl:w-[300px] border-r border-[var(--border)] bg-[var(--bg-secondary)] flex-shrink-0">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          🕐 {t("citations.history")}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {historyLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!historyLoading && history.length === 0 && (
          <p className="px-4 py-6 text-xs text-[var(--text-secondary)] text-center">
            {t("citations.noHistory")}
          </p>
        )}
        {history.map((entry) => (
          <button
            key={entry.paperId}
            onClick={() => handleHistoryClick(entry)}
            className={`w-full text-left px-4 py-3 border-b border-[var(--border)]/50 hover:bg-[var(--bg-card)] transition-colors group ${
              activePaperId === entry.paperId
                ? "bg-[var(--bg-card)] border-l-2 border-l-[var(--accent-blue)]"
                : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 leading-snug">
                {entry.title}
              </p>
              <span
                onClick={(e) => handleDeleteHistory(entry.paperId, e)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[var(--accent-red)] text-xs px-1 transition-opacity"
                title={t("citations.deleteHistory")}
              >
                ✕
              </span>
            </div>
            <div className="flex gap-2 mt-1 text-[10px] text-[var(--text-secondary)]">
              {entry.year && <span>📅 {entry.year}</span>}
              <span>📊 {entry.citationCount}</span>
              <span className="text-[var(--text-secondary)]/50">
                {new Date(entry.searchedAt).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Main Content ──
  const renderContent = () => (
    <div className="flex-1 overflow-y-auto">
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-8 h-8 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">
            {t("citations.searchingDesc")}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 px-8">
          <p className="text-4xl">😕</p>
          <p className="text-sm text-[var(--accent-red)] text-center">{error}</p>
          <button
            onClick={handleSearch}
            className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-[var(--bg-primary)] text-sm font-bold"
          >
            {t("citations.retry")}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 px-8">
          <p className="text-5xl">🔗</p>
          <p className="text-sm text-[var(--text-secondary)] text-center">
            {t("citations.emptyHint")}
          </p>
        </div>
      )}

      {/* Results + Filters */}
      {result && !loading && (
        <div className="px-4 py-4 space-y-4">
          {/* Paper info card */}
          <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">
              📄 {t("citations.matchedPaper")}
              {cachedAt && (
                <span className="ml-2 text-[10px] text-[var(--text-secondary)]/50 font-normal">
                  {t("citations.cachedLabel", {
                    date: new Date(cachedAt).toLocaleDateString(),
                  })}
                </span>
              )}
            </h2>
            <p className="text-base font-bold text-[var(--text-primary)]">
              {result.paper.title}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-[var(--text-secondary)]">
              {result.paper.year && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border)]">
                  📅 {result.paper.year}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border)]">
                📊 {t("citations.citedBy", { count: result.paper.citationCount })}
              </span>
              {arxivUrl(result.paper) && (
                <a
                  href={arxivUrl(result.paper)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:underline"
                >
                  arXiv
                </a>
              )}
              {hjfyUrl(result.paper) && (
                <a
                  href={hjfyUrl(result.paper)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded-full bg-[var(--accent-green)]/20 text-[var(--accent-green)] hover:underline"
                >
                  HJFY 中文版
                </a>
              )}
            </div>

            {/* Matched paper Cool Papers */}
            {!showMatchedKimi ? (
              <button
                onClick={handleMatchedCoolPapers}
                disabled={!result.paper.externalIds?.ArXiv}
                className="mt-3 w-full py-2 rounded-lg border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-xs font-medium hover:bg-[var(--accent-purple)]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>🧠</span>
                {t("citations.coolPapers")}
              </button>
            ) : loadingMatchedKimi ? (
              <div className="mt-3 text-center text-xs text-[var(--text-secondary)] py-2">
                {t("citations.loadingCoolPapers")}
              </div>
            ) : matchedKimiHtml ? (
              <div className="mt-3 kimi-content bg-[var(--bg-secondary)] rounded-lg p-3 text-sm leading-relaxed text-[var(--text-primary)] max-h-64 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: matchedKimiHtml }} />
              </div>
            ) : null}
          </div>

          {/* ── Filter Panel ── */}
          <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-4 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
              🔍 {t("citations.filters")}
            </h2>

            {/* Text search */}
            <div>
              <input
                type="text"
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
                placeholder={t("citations.filterByTitleAuthor")}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>

            {/* Year multi-select */}
            <div>
              <p className="text-[10px] text-[var(--text-secondary)] mb-1.5 font-medium">
                📅 {t("citations.filterByYear")}
              </p>
              <YearSelector
                yearCounts={yearCounts}
                selectedYears={selectedYears}
                onToggle={(year) => {
                  setSelectedYears((prev) => {
                    const next = new Set(prev);
                    if (next.has(year)) {
                      next.delete(year);
                    } else {
                      if (prev.size === 0) {
                        next.add(year);
                      } else {
                        next.add(year);
                      }
                    }
                    return next;
                  });
                }}
                onSelectAll={() => setSelectedYears(new Set())}
                onClear={() => setSelectedYears(new Set())}
              />
            </div>

            {/* Citation range slider */}
            <div>
              <p className="text-[10px] text-[var(--text-secondary)] mb-1.5 font-medium">
                📊 {t("citations.filterByCitations")}
              </p>
              <CitationRangeSlider
                min={citStats.min}
                max={citStats.max}
                rangeMin={citRangeMin}
                rangeMax={citRangeMax}
                onChange={(min, max) => {
                  setCitRangeMin(min);
                  setCitRangeMax(max);
                }}
                count={
                  result.citations.filter(
                    (c) =>
                      c.citationCount >= citRangeMin &&
                      c.citationCount <= citRangeMax
                  ).length
                }
              />
            </div>

            <button
              onClick={() => {
                setTextFilter("");
                setSelectedYears(new Set());
                setCitRangeMin(0);
                setCitRangeMax(citStats.max);
              }}
              className="text-[10px] px-2.5 py-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--text-primary)] transition-colors"
            >
              ↺ {t("citations.resetFilters")}
            </button>
          </div>

          {/* Sort + count */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-[var(--text-secondary)]">
              {t("citations.showingResults", {
                filtered: filtered.length,
                total: result.totalCitations,
              })}
            </p>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            >
              <option value="citations-desc">{t("citations.sortCitationsDesc")}</option>
              <option value="citations-asc">{t("citations.sortCitationsAsc")}</option>
              <option value="year-desc">{t("citations.sortYearDesc")}</option>
              <option value="year-asc">{t("citations.sortYearAsc")}</option>
            </select>
          </div>

          {/* Results list */}
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {t("citations.noResults")}
              </p>
            </div>
          ) : (
            <div className="space-y-2 pb-6">
              {filtered.map((paper, i) => (
                <button
                  key={paper.paperId || i}
                  onClick={() => setSelectedCitation(paper)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${
                    selectedCitation?.paperId === paper.paperId
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
                      : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent-blue)]/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">
                        {paper.title || t("citations.untitled")}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {paper.authors.slice(0, 5).join(", ")}
                        {paper.authors.length > 5 ? " et al." : ""}
                      </p>
                      {paper.venue && (
                        <p className="text-[11px] text-[var(--text-secondary)]/70 mt-0.5">
                          {paper.venue}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        {paper.year && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border)]">
                            {paper.year}
                          </span>
                        )}
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]">
                          📊 {paper.citationCount}
                        </span>
                        {paper.externalIds?.ArXiv && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(paper.externalIds!.ArXiv!, paper.title);
                            }}
                            className={`text-sm leading-none transition-colors ${
                              favoritedIds.has(paper.externalIds?.ArXiv || "")
                                ? "text-[var(--accent-orange)]"
                                : "text-[var(--text-secondary)]/40 hover:text-[var(--accent-orange)]"
                            }`}
                            title={favoritedIds.has(paper.externalIds?.ArXiv || "") ? "已收藏" : "收藏"}
                          >
                            {favoritedIds.has(paper.externalIds?.ArXiv || "") ? "⭐" : "☆"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {paper.externalIds?.ArXiv && (
                          <a
                            href={`https://arxiv.org/abs/${paper.externalIds.ArXiv}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:underline"
                          >
                            arXiv
                          </a>
                        )}
                        {paper.externalIds?.ArXiv && (
                          <a
                            href={`https://hjfy.top/arxiv/${paper.externalIds.ArXiv}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/20 text-[var(--accent-green)] hover:underline"
                          >
                            HJFY
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Detail Panel (desktop right side) ──
  const renderDetailPanel = () => {
    if (!selectedCitation) {
      return (
        <div className="hidden xl:flex items-center justify-center h-full text-xs text-[var(--text-secondary)]/40">
          <p>{t("citations.clickForDetail")}</p>
        </div>
      );
    }
    return (
      <div className="p-4 h-full overflow-hidden flex flex-col">
        <CitationDetail
          key={selectedCitation.paperId}
          paper={selectedCitation}
          onClose={() => setSelectedCitation(null)}
          isFavorite={favoritedIds.has(selectedCitation?.externalIds?.ArXiv || "")}
          onToggleFavorite={() => {
            if (selectedCitation?.externalIds?.ArXiv) {
              toggleFavorite(selectedCitation.externalIds.ArXiv, selectedCitation.title);
            }
          }}
          t={t}
        />
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <h1 className="text-lg font-bold text-[var(--text-primary)] mb-3">
          🔗 {t("citations.title")}
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          {t("citations.description")}
        </p>

        {/* Mobile history dropdown */}
        {history.length > 0 && (
          <details className="lg:hidden mb-3">
            <summary className="text-xs text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]">
              🕐 {t("citations.history")} ({history.length})
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
              {history.map((entry) => (
                <button
                  key={entry.paperId}
                  onClick={() => handleHistoryClick(entry)}
                  className={`w-full text-left px-3 py-2 border-b border-[var(--border)]/50 hover:bg-[var(--bg-primary)] text-xs ${
                    activePaperId === entry.paperId ? "bg-[var(--bg-primary)]" : ""
                  }`}
                >
                  <span className="line-clamp-1 text-[var(--text-primary)]">{entry.title}</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {entry.year} · 📊{entry.citationCount}
                  </span>
                </button>
              ))}
            </div>
          </details>
        )}

        {/* Search bar */}
        <div className="flex gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) handleSearch();
            }}
            placeholder={t("citations.searchPlaceholder")}
            className="flex-1 px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !title.trim()}
            className="px-5 py-2.5 rounded-lg bg-[var(--accent-blue)] text-[var(--bg-primary)] font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {loading ? t("citations.searching") : t("citations.search")}
          </button>
        </div>
      </div>

      {/* Body: history + results list + detail panel */}
      <div className="flex-1 min-h-0 flex">
        {renderHistorySidebar()}
        <div className="flex-1 min-w-0 flex">
          {renderContent()}
          {/* Detail panel — xl screens only */}
          <div className="hidden xl:flex xl:flex-col xl:w-[380px] 2xl:w-[440px] border-l border-[var(--border)] bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
            {renderDetailPanel()}
          </div>
        </div>
      </div>

      {/* Mobile: detail panel as full overlay */}
      {selectedCitation && (
        <div className="xl:hidden fixed inset-0 z-50 bg-[var(--bg-primary)] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <CitationDetail
              key={selectedCitation.paperId}
              paper={selectedCitation}
              onClose={() => setSelectedCitation(null)}
              isFavorite={favoritedIds.has(selectedCitation?.externalIds?.ArXiv || "")}
              onToggleFavorite={() => {
                if (selectedCitation?.externalIds?.ArXiv) {
                  toggleFavorite(selectedCitation.externalIds.ArXiv, selectedCitation.title);
                }
              }}
              t={t}
            />
          </div>
        </div>
      )}
    </div>
  );
}
