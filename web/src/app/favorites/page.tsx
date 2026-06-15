"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Paper, FavoriteFolder } from "@/lib/types";
import { useFavoritesContext } from "@/components/FavoritesContext";
import { useLanguage } from "@/components/LanguageContext";

// ── Resizable divider ──

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const dragging = useRef(false);
  const startX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(delta);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onResize]);

  return (
    <div
      onMouseDown={onMouseDown}
      className="hidden lg:flex flex-col items-center justify-center w-2 flex-shrink-0 cursor-col-resize hover:bg-[var(--accent-blue)]/10 transition-colors group border-x border-[var(--border)]"
    >
      <div className="w-0.5 h-8 rounded-full bg-[var(--border)] group-hover:bg-[var(--accent-blue)]/50 transition-colors" />
    </div>
  );
}

// ── Paper Detail Panel ──

function PaperDetail({
  paper,
  onClose,
  t,
}: {
  paper: Paper;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [kimiHtml, setKimiHtml] = useState<string | null>(null);
  const [loadingKimi, setLoadingKimi] = useState(false);
  const [showKimi, setShowKimi] = useState(false);
  const [showHjfy, setShowHjfy] = useState(true);

  const handleCoolPapers = useCallback(() => {
    if (kimiHtml) { setShowKimi(!showKimi); return; }
    setShowKimi(true);
    setLoadingKimi(true);
    fetch(`/api/papers/${encodeURIComponent(paper.arxiv_id)}/kimi`)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); })
      .then((html) => setKimiHtml(html))
      .catch((err) => console.error("Kimi failed:", err))
      .finally(() => setLoadingKimi(false));
  }, [paper.arxiv_id, kimiHtml, showKimi]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header — fixed */}
      <div className="flex-shrink-0 mb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)] leading-snug">
              {paper.title}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {paper.authors.slice(0, 5).join(", ")}
              {paper.authors.length > 5 ? " et al." : ""}
              {paper.published_date && ` · ${paper.published_date.slice(0, 10)}`}
            </p>
            {paper.matched_domain && (
              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                {paper.matched_domain}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-secondary)] text-sm"
          >✕</button>
        </div>
      </div>

      {/* Action buttons — fixed */}
      <div className="flex gap-2 mb-3 flex-shrink-0 flex-wrap">
        <a href={paper.arxiv_url || paper.pdf_url} target="_blank" rel="noopener noreferrer"
          className="flex-1 min-w-[80px] text-center px-3 py-2 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 text-[var(--accent-blue)] text-xs font-medium hover:bg-[var(--accent-blue)]/20 transition-colors">
          📄 arXiv
        </a>
        <button
          onClick={() => setShowHjfy(!showHjfy)}
          className={`flex-1 min-w-[80px] text-center px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
            showHjfy
              ? "bg-[var(--accent-green)]/10 border-[var(--accent-green)]/30 text-[var(--accent-green)]"
              : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]"
          }`}>
          🌐 HJFY 中文版
        </button>
        <button
          onClick={handleCoolPapers}
          className={`flex-1 min-w-[80px] text-center px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
            showKimi
              ? "bg-[var(--accent-purple)]/10 border-[var(--accent-purple)]/30 text-[var(--accent-purple)]"
              : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--accent-purple)]/10 hover:border-[var(--accent-purple)]/30 hover:text-[var(--accent-purple)]"
          }`}>
          🧠 Cool Papers
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {/* HJFY iframe */}
        {showHjfy && (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-[65vh]">
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
              <span className="text-[10px] text-[var(--text-secondary)]">HJFY 中文翻译</span>
              <a
                href={`https://hjfy.top/arxiv/${paper.arxiv_id}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-[var(--accent-blue)] hover:underline"
              >新窗口打开 ↗</a>
            </div>
            <iframe
              src={`https://hjfy.top/arxiv/${paper.arxiv_id}`}
              className="flex-1 w-full border-0"
              title="HJFY Chinese Translation"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        )}

        {/* Cool Papers Kimi */}
        {showKimi && (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
              <span className="text-[10px] text-[var(--text-secondary)]">🧠 Cool Papers (Kimi) 中文解读</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {loadingKimi ? (
                <div className="text-center text-xs text-[var(--text-secondary)] py-8">
                  正在加载 Cool Papers 解读...
                </div>
              ) : kimiHtml ? (
                <div className="kimi-content p-3 text-sm leading-relaxed text-[var(--text-primary)]"
                  dangerouslySetInnerHTML={{ __html: kimiHtml }} />
              ) : (
                <div className="text-center text-xs text-[var(--text-secondary)] py-8">
                  加载失败
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Paper List Item ──

function PaperItem({
  paper,
  isSelected,
  onClick,
  onRemove,
  onDragStart,
  t,
}: {
  paper: Paper;
  isSelected: boolean;
  onClick: () => void;
  onRemove: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, paper.arxiv_id)}
      onClick={onClick}
      className={`border rounded-lg p-3 transition-colors cursor-pointer group flex items-start gap-3 ${
        isSelected
          ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
          : "border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent-blue)]/50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-white group-hover:text-[var(--accent-blue)] transition-colors line-clamp-2">
          {paper.title}
        </h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {paper.matched_domain && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
              {paper.matched_domain}
            </span>
          )}
          <span className="text-[10px] text-[var(--text-secondary)]">
            {paper.authors.slice(0, 2).join(", ")}
            {paper.authors.length > 2 ? " et al." : ""}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">
            {paper.published_date?.slice(0, 10)}
          </span>
        </div>
        <div className="flex gap-2 mt-1.5">
          <a href={paper.arxiv_url || paper.pdf_url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] hover:underline"
          >arXiv</a>
          <a href={`https://hjfy.top/arxiv/${paper.arxiv_id}`} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-green)]/10 text-[var(--accent-green)] hover:underline"
          >HJFY</a>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(paper.arxiv_id); }}
        className="flex-shrink-0 p-1 text-[var(--text-secondary)] hover:text-[var(--accent-red)] transition-colors opacity-0 group-hover:opacity-100"
        title={t("favorites.removeFavorite")}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

// ── Folder Section ──

function FolderSection({
  folder, papers, selectedPaperId, expanded,
  onToggle, onDelete, onRename, onRemovePaper, onSelectPaper,
  onDragStart, onDrop, dragOverId, onDragOver, onDragLeave, t,
}: {
  folder: FavoriteFolder;
  papers: Paper[];
  selectedPaperId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onRemovePaper: (id: string) => void;
  onSelectPaper: (paper: Paper) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent) => void;
  dragOverId: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const isDragOver = dragOverId === folder.id;

  return (
    <div className={`rounded-lg border transition-colors ${isDragOver ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5" : "border-[var(--border)]"}`}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={onToggle}>
        <span className={`text-xs transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        <span className="text-base">📁</span>
        {editing ? (
          <input ref={inputRef} value={editName} onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onRename(editName); setEditing(false); } if (e.key === "Escape") { setEditName(folder.name); setEditing(false); } }}
            onBlur={() => { onRename(editName); setEditing(false); }} onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-sm text-white border-b border-[var(--accent-blue)] outline-none" />
        ) : (
          <span className="flex-1 text-sm font-medium text-white">{folder.name}</span>
        )}
        <span className="text-xs text-[var(--text-secondary)]">{papers.length}</span>
        <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="p-0.5 text-[var(--text-secondary)] hover:text-[var(--accent-blue)] text-xs" title={t("favorites.rename")}>✏️</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-0.5 text-[var(--text-secondary)] hover:text-[var(--accent-red)] text-xs" title={t("favorites.deleteFolder")}>🗑️</button>
      </div>
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {papers.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)] py-2 text-center">{t("favorites.dragHint")}</p>
          ) : (
            papers.map((p) => (
              <PaperItem key={p.arxiv_id} paper={p} isSelected={selectedPaperId === p.arxiv_id}
                onClick={() => onSelectPaper(p)} onRemove={onRemovePaper} onDragStart={onDragStart} t={t} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

const MIN_LEFT_W = 280;
const MAX_LEFT_W = 600;

export default function FavoritesPage() {
  const {
    papers, folders, loading,
    createFolder: createFolderFn, deleteFolder: deleteFolderFn,
    renameFolder: renameFolderFn, movePaper, removeFavorite: removeFavoriteFn,
  } = useFavoritesContext();
  const { t } = useLanguage();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [leftWidth, setLeftWidth] = useState(360);

  useEffect(() => { if (showNewFolder) newFolderRef.current?.focus(); }, [showNewFolder]);

  const folderPaperIds = new Set(folders.flatMap((f) => f.paperIds));
  const uncategorized = papers.filter((p) => !folderPaperIds.has(p.arxiv_id));
  const paperMap = new Map(papers.map((p) => [p.arxiv_id, p]));

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await createFolderFn(name);
    setNewFolderName(""); setShowNewFolder(false);
  };

  const handleDragStart = (e: React.DragEvent, arxivId: string) => {
    e.dataTransfer.setData("text/plain", arxivId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault(); setDragOverFolderId(null);
    const arxivId = e.dataTransfer.getData("text/plain");
    if (!arxivId) return;
    await movePaper(arxivId, folderId);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleResize = useCallback((delta: number) => {
    setLeftWidth((w) => Math.min(MAX_LEFT_W, Math.max(MIN_LEFT_W, w + delta)));
  }, []);

  if (loading && papers.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderList = () => (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base lg:text-lg font-bold text-white">{t("favorites.title")}</h1>
            <span className="text-xs text-[var(--text-secondary)]">{t("favorites.count", { count: papers.length })}</span>
          </div>
          {showNewFolder ? (
            <div className="flex items-center gap-1.5">
              <input ref={newFolderRef} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); } }}
                placeholder={t("favorites.folderName")}
                className="px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)] w-28" />
              <button onClick={handleCreateFolder} className="px-2 py-1 rounded bg-[var(--accent-blue)] text-[var(--bg-primary)] text-xs font-bold">{t("favorites.confirm")}</button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="px-2 py-1 rounded text-xs text-[var(--text-secondary)]">{t("favorites.cancel")}</button>
            </div>
          ) : (
            <button onClick={() => setShowNewFolder(true)} className="px-3 py-1 rounded-lg bg-[var(--accent-blue)] text-[var(--bg-primary)] text-xs font-bold">
              {t("favorites.newFolder")}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 w-full">
        {papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 mt-16">
            <span className="text-4xl">⭐</span>
            <p className="text-sm text-[var(--text-secondary)]">{t("favorites.empty")}</p>
          </div>
        ) : (
          <>
            {folders.map((folder) => {
              const folderPapers = folder.paperIds.map((id) => paperMap.get(id)).filter((p): p is Paper => !!p);
              return (
                <FolderSection key={folder.id} folder={folder} papers={folderPapers}
                  selectedPaperId={selectedPaper?.arxiv_id ?? null} expanded={expandedFolders.has(folder.id)}
                  onToggle={() => toggleFolder(folder.id)} onDelete={() => deleteFolderFn(folder.id)}
                  onRename={(name) => renameFolderFn(folder.id, name)} onRemovePaper={removeFavoriteFn}
                  onSelectPaper={setSelectedPaper} onDragStart={handleDragStart}
                  onDrop={(e) => handleDrop(e, folder.id)} dragOverId={dragOverFolderId}
                  onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(folder.id); }}
                  onDragLeave={() => setDragOverFolderId(null)} t={t} />
              );
            })}
            <div className={`rounded-lg border transition-colors ${dragOverFolderId === "__uncategorized" ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5" : "border-transparent"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverFolderId("__uncategorized"); }}
              onDragLeave={() => setDragOverFolderId(null)} onDrop={(e) => handleDrop(e, null)}>
              {(uncategorized.length > 0 || folders.length > 0) && (
                <div className="flex items-center gap-2 px-1 py-1.5">
                  <span className="text-xs text-[var(--text-secondary)] font-medium">
                    {folders.length > 0 ? t("favorites.uncategorized") : t("favorites.all")}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">{uncategorized.length}</span>
                </div>
              )}
              <div className="space-y-1.5">
                {uncategorized.map((paper) => (
                  <PaperItem key={paper.arxiv_id} paper={paper} isSelected={selectedPaper?.arxiv_id === paper.arxiv_id}
                    onClick={() => setSelectedPaper(paper)} onRemove={removeFavoriteFn} onDragStart={handleDragStart} t={t} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex">
      {/* Left list */}
      <div
        className={`${selectedPaper ? "hidden lg:flex lg:flex-shrink-0" : "flex-1"} h-full`}
        style={selectedPaper ? { width: leftWidth } : undefined}
      >
        {renderList()}
      </div>

      {/* Resize handle */}
      {selectedPaper && (
        <ResizeHandle onResize={handleResize} />
      )}

      {/* Desktop detail panel */}
      {selectedPaper && (
        <>
          <div className="hidden lg:flex lg:flex-col flex-1 h-full overflow-hidden bg-[var(--bg-secondary)]">
            <div className="flex-1 overflow-y-auto p-4">
              <PaperDetail paper={selectedPaper} onClose={() => setSelectedPaper(null)} t={t} />
            </div>
          </div>
          {/* Mobile overlay */}
          <div className="lg:hidden fixed inset-0 z-50 bg-[var(--bg-primary)] flex flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              <PaperDetail paper={selectedPaper} onClose={() => setSelectedPaper(null)} t={t} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
