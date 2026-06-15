"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { usePapersContext } from "@/components/PapersContext";
import { useLanguage } from "@/components/LanguageContext";
import { submitFeedback, updatePreferences, fetchHistoryDates } from "@/lib/api";
import PaperCard from "@/components/PaperCard";
import PaperListItem from "@/components/PaperListItem";
import SwipeContainer from "@/components/SwipeContainer";
import ProgressBar from "@/components/ProgressBar";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function HistoryCalendar({
  availableDates,
  onSelect,
  onClose,
}: {
  availableDates: string[];
  onSelect: (dateStr: string) => void;
  onClose: () => void;
}) {
  const availableSet = new Set(availableDates);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else { setViewMonth((m) => m - 1); }
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else { setViewMonth((m) => m + 1); }
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;

  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const canGoPrev = viewYear > 2024 || (viewYear === 2024 && viewMonth > 2);
  const canGoNext =
    viewYear < today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth < today.getMonth());

  const handleDayClick = (dateStr: string) => {
    onSelect(dateStr);
  };

  return (
    <>
      {/* Backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Calendar */}
      <div className="absolute z-50 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl p-3 w-64">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={prevMonth}
            disabled={!canGoPrev}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-purple)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-default transition-colors text-lg"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {viewYear}年{viewMonth + 1}月
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={!canGoNext}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-purple)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-default transition-colors text-lg"
          >
            ›
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] text-[var(--text-secondary)] py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d, i) => {
            if (d === null) return <div key={`empty-${viewYear}-${viewMonth}-${i}`} className="h-8" />;

            const m = String(viewMonth + 1).padStart(2, "0");
            const ds = String(d).padStart(2, "0");
            const dateStr = `${viewYear}-${m}-${ds}`;
            const isAvailable = availableDates.length === 0 || availableSet.has(dateStr);
            const isToday =
              d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
            const dayKey = `d-${viewYear}-${viewMonth}-${d}`;

            if (!isAvailable) {
              return (
                <span
                  key={dayKey}
                  className="h-8 flex items-center justify-center rounded-full text-xs text-[var(--border)] opacity-30"
                >
                  {d}
                </span>
              );
            }

            return (
              <button
                key={dayKey}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDayClick(dateStr);
                }}
                className={`h-8 flex items-center justify-center rounded-full text-xs transition-colors cursor-pointer select-none
                  ${isToday
                    ? "text-[var(--accent-purple)] font-bold hover:bg-[var(--accent-purple)] hover:text-[var(--bg-primary)]"
                    : "text-[var(--text-primary)] hover:bg-[var(--accent-purple)] hover:text-[var(--bg-primary)]"
                  }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

const DATE_RANGES = [
  { value: "", labelKey: "papers.today" },
  { value: "week", labelKey: "papers.thisWeek" },
  { value: "month", labelKey: "papers.thisMonth" },
];

function DateRangeSelector({
  value,
  onChange,
  onHistoryToggle,
  isHistoryMode,
  compact,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  onHistoryToggle: () => void;
  isHistoryMode: boolean;
  compact?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex gap-1.5">
      {DATE_RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`rounded-full font-medium transition-colors ${
            !isHistoryMode && value === r.value
              ? "bg-[var(--accent-blue)] text-[var(--bg-primary)]"
              : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
          } ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
        >
          {t(r.labelKey)}
        </button>
      ))}
      <button
        onClick={onHistoryToggle}
        className={`rounded-full font-medium transition-colors ${
          isHistoryMode
            ? "bg-[var(--accent-purple)] text-[var(--bg-primary)]"
            : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
        } ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
      >
        {t("papers.history")}
      </button>
    </div>
  );
}

function SearchBar({
  focusInput,
  setFocusInput,
  activeFocus,
  loading,
  filtering,
  papersCount,
  onSearch,
  onFilter,
  onClear,
  compact,
  t,
}: {
  focusInput: string;
  setFocusInput: (v: string) => void;
  activeFocus: string;
  loading: boolean;
  filtering: boolean;
  papersCount: number;
  onSearch: (focus: string) => void;
  onFilter: (focus: string) => void;
  onClear: () => void;
  compact?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const inputClass = compact
    ? "flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)]"
    : "flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)]";

  return (
    <>
      <div className="flex gap-2">
        <input
          type="text"
          value={focusInput}
          onChange={(e) => setFocusInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && focusInput.trim()) onSearch(focusInput);
          }}
          placeholder={compact ? t("papers.searchPlaceholderCompact") : t("papers.searchPlaceholder")}
          className={inputClass}
        />
      </div>
      {focusInput.trim() && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onFilter(focusInput)}
            disabled={filtering || papersCount === 0}
            className={`flex-1 rounded-lg font-bold border border-[var(--accent-blue)] text-[var(--accent-blue)] disabled:opacity-50 ${compact ? "px-2 py-1 text-[10px] rounded" : "px-3 py-1.5 text-xs bg-[var(--bg-card)]"}`}
          >
            {filtering ? t("papers.filtering") : compact ? t("papers.filter") : t("papers.filterInResults")}
          </button>
          <button
            onClick={() => onSearch(focusInput)}
            disabled={loading}
            className={`flex-1 rounded-lg font-bold bg-[var(--accent-blue)] text-[var(--bg-primary)] disabled:opacity-50 ${compact ? "px-2 py-1 text-[10px] rounded" : "px-3 py-1.5 text-xs"}`}
          >
            {loading ? t("papers.searching") : compact ? t("papers.search") : t("papers.searchAgain")}
          </button>
        </div>
      )}
      {activeFocus && (
        <div className="flex items-center gap-2 mt-2">
          {!compact && <span className="text-xs text-[var(--text-secondary)]">{t("papers.currentDirection")}</span>}
          <span className={`px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] ${compact ? "text-[10px]" : "text-xs"}`}>
            {activeFocus}
          </span>
          <button
            onClick={onClear}
            className={`text-[var(--text-secondary)] hover:text-[var(--accent-red)] ${compact ? "text-[10px]" : "text-xs"}`}
          >
            {t("papers.clear")}
          </button>
        </div>
      )}
    </>
  );
}

export default function PapersPage() {
  const {
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
    isHistoryMode,
    setHistoryDate,
  } = usePapersContext();
  const { t } = useLanguage();

  const [showCalendar, setShowCalendar] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  function handleHistoryToggle() {
    if (isHistoryMode) {
      setShowCalendar(false);
      setDateRange("");
    } else {
      setShowCalendar(true);
      fetchHistoryDates()
        .then(setAvailableDates)
        .catch(() => setAvailableDates([]));
    }
  }

  function handleCalendarSelect(dateStr: string) {
    console.log("Calendar date selected:", dateStr);
    setShowCalendar(false);
    setHistoryDate(dateStr);
  }

  function handleCloseCalendar() {
    setShowCalendar(false);
  }

  const handleFeedback = useCallback(
    async (rating: "like" | "neutral" | "dislike" | undefined) => {
      const paper = papers[currentIndex];
      if (!paper) return;

      if (rating === undefined) {
        setPapers((prev) =>
          prev.map((p, i) => (i === currentIndex ? { ...p, feedback: undefined } : p))
        );
        setFeedbackCount((c) => Math.max(0, c - 1));
        return;
      }

      setPapers((prev) =>
        prev.map((p, i) => (i === currentIndex ? { ...p, feedback: rating } : p))
      );
      setFeedbackCount((c) => c + (paper.feedback ? 0 : 1));

      try {
        const result = await submitFeedback(paper, rating, date);

        setTimeout(() => {
          if (currentIndex < papers.length - 1) {
            setCurrentIndex((i) => i + 1);
          }
        }, 500);

        if (result.should_update_preferences && !updatingPrefs) {
          setUpdatingPrefs(true);
          updatePreferences()
            .catch(console.error)
            .finally(() => setUpdatingPrefs(false));
        }
      } catch (err) {
        console.error("Feedback failed:", err);
        setPapers((prev) =>
          prev.map((p, i) =>
            i === currentIndex ? { ...p, feedback: paper.feedback } : p
          )
        );
      }
    },
    [papers, currentIndex, date, updatingPrefs, setPapers, setFeedbackCount, setCurrentIndex, setUpdatingPrefs]
  );

  const handleSwipe = useCallback(
    (direction: "up" | "down") => {
      if (direction === "up" && currentIndex < papers.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else if (direction === "down" && currentIndex > 0) {
        setCurrentIndex((i) => i - 1);
      }
    },
    [currentIndex, papers.length, setCurrentIndex]
  );

  const handleDateRangeChange = useCallback((range: string) => {
    setShowCalendar(false);
    setAvailableDates([]);
    setDateRange(range);
  }, [setDateRange]);

  const searchBarProps = {
    focusInput,
    setFocusInput,
    activeFocus,
    loading,
    filtering,
    papersCount: papers.length,
    onSearch: handleSearch,
    onFilter: handleFilter,
    onClear: handleClear,
    t,
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm lg:text-base text-[var(--text-secondary)]">
            {isHistoryMode
              ? t("papers.loadingHistory", { date })
              : activeFocus
                ? t("papers.searchingFocus", { focus: activeFocus })
                : t("papers.loadingDate", { date })}
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <p className="text-[var(--accent-red)] text-sm lg:text-base text-center">{error}</p>
          <button
            onClick={() => activeFocus ? handleSearch(activeFocus) : loadPapers(date)}
            className="px-6 py-2.5 bg-[var(--accent-blue)] text-[var(--bg-primary)] rounded-lg text-sm lg:text-base font-bold"
          >
            {t("papers.retry")}
          </button>
        </div>
      );
    }

    if (papers.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-5xl">📭</p>
          <p className="text-sm lg:text-base text-[var(--text-secondary)]">
            {activeFocus ? t("papers.noResultsFocus", { focus: activeFocus }) : t("papers.noResultsDate", { date })}
          </p>
        </div>
      );
    }

    return null;
  };

  const hasPapers = !loading && !error && papers.length > 0;

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] lg:hidden space-y-2">
        <DateRangeSelector
          value={dateRange}
          onChange={handleDateRangeChange}
          onHistoryToggle={handleHistoryToggle}
          isHistoryMode={isHistoryMode}
          t={t}
        />
        {showCalendar && (
          <div className="relative">
            <HistoryCalendar
              availableDates={availableDates}
              onSelect={handleCalendarSelect}
              onClose={handleCloseCalendar}
            />
          </div>
        )}
        {!isHistoryMode && <SearchBar {...searchBarProps} />}
        {isHistoryMode && (
          <div className="text-xs text-[var(--text-secondary)]">
            {t("papers.viewingHistory", { date })}
          </div>
        )}
      </div>

      {/* Desktop left panel */}
      <div className="hidden lg:flex lg:flex-col lg:w-[340px] xl:w-[380px] border-r border-[var(--border)] bg-[var(--bg-secondary)] flex-shrink-0">
        <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">📅</span>
              <DateRangeSelector
                value={dateRange}
                onChange={handleDateRangeChange}
                onHistoryToggle={handleHistoryToggle}
                isHistoryMode={isHistoryMode}
                compact
                t={t}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-[var(--accent-blue)] text-[var(--bg-primary)] px-2.5 py-0.5 rounded-full text-xs font-bold">
                {papers.length} papers
              </span>
              {feedbackCount > 0 && (
                <span className="text-xs text-[var(--accent-green)]">✓{feedbackCount}</span>
              )}
            </div>
          </div>
          {showCalendar && (
            <div className="relative">
              <HistoryCalendar
                availableDates={availableDates}
                onSelect={handleCalendarSelect}
                onClose={handleCloseCalendar}
              />
            </div>
          )}
          {!isHistoryMode && <SearchBar {...searchBarProps} compact />}
          {isHistoryMode && (
            <div className="mt-2 text-xs text-[var(--text-secondary)]">
              {t("papers.viewingHistory", { date })}
            </div>
          )}
          {updatingPrefs && (
            <div className="mt-1 text-xs text-center text-[var(--accent-green)]">
              {t("papers.updatingPrefs")}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {hasPapers && papers.map((paper, index) => (
            <PaperListItem
              key={paper.arxiv_id}
              paper={paper}
              isSelected={index === currentIndex}
              onClick={() => setCurrentIndex(index)}
            />
          ))}
          {!hasPapers && (
            <div className="flex-1 flex items-center justify-center p-8">
              {renderContent()}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 flex flex-col">
        {hasPapers ? (
          <>
            <div className="lg:hidden">
              <ProgressBar
                current={currentIndex}
                total={papers.length}
                date={date}
                feedbackCount={feedbackCount}
              />
              {updatingPrefs && (
                <div className="px-4 py-1 text-[10px] text-center text-[var(--accent-green)] bg-green-900/20">
                  {t("papers.updatingPrefsFromFeedback")}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 lg:hidden">
              <SwipeContainer
                currentIndex={currentIndex}
                totalItems={papers.length}
                onSwipe={handleSwipe}
              >
                <PaperCard
                  key={papers[currentIndex].arxiv_id}
                  paper={papers[currentIndex]}
                  onFeedback={handleFeedback}
                />
              </SwipeContainer>
            </div>

            <div className="hidden lg:flex lg:flex-1 lg:min-h-0">
              <div className="flex-1 overflow-y-auto">
                <PaperCard
                  key={papers[currentIndex].arxiv_id}
                  paper={papers[currentIndex]}
                  onFeedback={handleFeedback}
                />
              </div>
            </div>
          </>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
}
