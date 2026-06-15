"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import type { Paper, PapersResponse } from "@/lib/types";
import {
  fetchPapers as apiFetchPapers,
  fetchPapersWithFocus,
  filterPapers as apiFilterPapers,
} from "@/lib/api";
import { useLanguage } from "@/components/LanguageContext";

interface PapersContextValue {
  papers: Paper[];
  setPapers: React.Dispatch<React.SetStateAction<Paper[]>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  date: string;
  dateRange: string;
  setDateRange: (range: string) => void;
  loading: boolean;
  error: string | null;
  feedbackCount: number;
  setFeedbackCount: React.Dispatch<React.SetStateAction<number>>;
  updatingPrefs: boolean;
  setUpdatingPrefs: React.Dispatch<React.SetStateAction<boolean>>;
  focusInput: string;
  setFocusInput: React.Dispatch<React.SetStateAction<string>>;
  activeFocus: string;
  filtering: boolean;
  loadPapers: (targetDate: string, range?: string, src?: string) => void;
  handleSearch: (focus: string) => void;
  handleFilter: (focus: string) => void;
  handleClear: () => void;
  initialized: boolean;
  source: "arxiv" | "github";
  isHistoryMode: boolean;
  setHistoryDate: (selectedDate: string) => void;
}

const PapersContext = createContext<PapersContextValue | null>(null);

export function usePapersContext() {
  const ctx = useContext(PapersContext);
  if (!ctx) throw new Error("usePapersContext must be used within PapersProvider");
  return ctx;
}

export function PapersProvider({ children }: { children: React.ReactNode }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dateRange, setDateRangeState] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [updatingPrefs, setUpdatingPrefs] = useState(false);
  const [focusInput, setFocusInput] = useState("");
  const [activeFocus, setActiveFocus] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [source, setSource] = useState<"arxiv" | "github">("arxiv");

  const isHistoryMode = source === "github";

  // Use ref to track if a search is in-flight so navigation doesn't kill it
  const abortRef = useRef(false);

  const loadPapers = useCallback((
    targetDate: string,
    range?: string,
    src?: string
  ) => {
    setLoading(true);
    setError(null);
    abortRef.current = false;
    const effectiveSource = src || source;
    const effectiveRange =
      effectiveSource === "github" ? undefined : (range ?? dateRange);
    apiFetchPapers(targetDate, effectiveRange || undefined, effectiveSource)
      .then((data: PapersResponse) => {
        if (abortRef.current) return;
        setPapers(data.papers);
        setCurrentIndex(0);
        setFeedbackCount(data.papers.filter((p) => p.feedback).length);
        setInitialized(true);
      })
      .catch((err: Error) => {
        if (abortRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (!abortRef.current) setLoading(false);
      });
  }, [dateRange, source]);

  const handleSearch = useCallback(
    (focus: string) => {
      if (!focus.trim()) {
        loadPapers(date, undefined, source);
        setActiveFocus("");
        return;
      }
      setLoading(true);
      setError(null);
      setActiveFocus(focus);
      abortRef.current = false;
      fetchPapersWithFocus(date, focus, dateRange || undefined)
        .then((data) => {
          if (abortRef.current) return;
          setPapers(data.papers);
          setCurrentIndex(0);
          setFeedbackCount(data.papers.filter((p) => p.feedback).length);
        })
        .catch((err: unknown) => {
          if (abortRef.current) return;
          setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (!abortRef.current) setLoading(false);
        });
    },
    [date, loadPapers, source]
  );

  const handleFilter = useCallback(
    (focus: string) => {
      if (!focus.trim() || papers.length === 0) return;
      setFiltering(true);
      setActiveFocus(focus);
      abortRef.current = false;
      apiFilterPapers(date, focus)
        .then((data) => {
          if (abortRef.current) return;
          setPapers(data.papers);
          setCurrentIndex(0);
          setFeedbackCount(data.papers.filter((p) => p.feedback).length);
        })
        .catch((err: unknown) => {
          if (abortRef.current) return;
          setError(err instanceof Error ? err.message : "Filter failed");
        })
        .finally(() => {
          if (!abortRef.current) setFiltering(false);
        });
    },
    [date, papers.length]
  );

  const handleClear = useCallback(() => {
    setActiveFocus("");
    setFocusInput("");
    // If in history mode, switch back to today; otherwise use current date
    if (source === "github") {
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
      setSource("arxiv");
      setDateRangeState("");
      loadPapers(today, undefined, "arxiv");
    } else {
      loadPapers(date, undefined, source);
    }
  }, [date, loadPapers, source]);

  const setDateRange = useCallback((range: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    setSource("arxiv");
    setDateRangeState(range);
    setInitialized(false);
    loadPapers(today, range, "arxiv");
  }, [loadPapers]);

  const setHistoryDate = useCallback((selectedDate: string) => {
    setDate(selectedDate);
    setSource("github");
    setDateRangeState("");
    setInitialized(false);
    loadPapers(selectedDate, undefined, "github");
  }, [loadPapers]);

  // Initial load
  useEffect(() => {
    if (!initialized && !loading) {
      loadPapers(date);
    }
  }, [date, initialized, loading, loadPapers]);

  // Re-fetch when language changes (after initial load) — skip history mode
  const { language } = useLanguage();
  const prevLangRef = useRef(language);
  useEffect(() => {
    if (source === "github") return; // Don't reload historical data on language switch
    if (prevLangRef.current !== language && initialized) {
      prevLangRef.current = language;
      if (activeFocus) {
        handleSearch(activeFocus);
      } else {
        setInitialized(false);
      }
    }
  }, [language, initialized, activeFocus, handleSearch, source]);

  const value = useMemo<PapersContextValue>(
    () => ({
      papers,
      setPapers,
      currentIndex,
      setCurrentIndex,
      date,
      dateRange,
      setDateRange,
      loading,
      error,
      feedbackCount,
      setFeedbackCount,
      updatingPrefs,
      setUpdatingPrefs,
      focusInput,
      setFocusInput,
      activeFocus,
      filtering,
      loadPapers,
      handleSearch,
      handleFilter,
      handleClear,
      initialized,
      source,
      isHistoryMode,
      setHistoryDate,
    }),
    [
      papers, currentIndex, date, dateRange, loading, error,
      feedbackCount, updatingPrefs, focusInput, activeFocus, filtering,
      initialized, source, isHistoryMode,
      setDateRange, loadPapers, handleSearch, handleFilter, handleClear, setHistoryDate,
    ]
  );

  return (
    <PapersContext.Provider value={value}>
      {children}
    </PapersContext.Provider>
  );
}
