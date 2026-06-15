import { NextRequest, NextResponse } from "next/server";
import { searchCitations } from "@/lib/citations-bridge";
import { cacheCitations } from "@/lib/data";
import type { CitationCacheData } from "@/lib/data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim();
  const minYear = searchParams.get("minYear");
  const maxYear = searchParams.get("maxYear");
  const minCitations = searchParams.get("minCitations");
  const maxResults = parseInt(searchParams.get("maxResults") || "500", 10);

  if (!title) {
    return NextResponse.json(
      { error: "Missing 'title' query parameter" },
      { status: 400 }
    );
  }

  try {
    // Step 1: Search (Python bridge handles match_title + get_citations)
    const result = await searchCitations(title, Math.min(maxResults, 1000));

    // Step 2: Build cache data
    const cacheData: CitationCacheData = {
      paper: result.paper,
      citations: result.citations,
      totalCitations: result.totalCitations,
      cachedAt: new Date().toISOString(),
    };

    // Step 3: Write cache in background (don't block response)
    cacheCitations(result.paper.paperId, cacheData).catch((err) =>
      console.warn("Failed to cache citations:", err)
    );

    // Step 4: Apply filters
    let filtered = result.citations;

    if (minYear) {
      const minY = parseInt(minYear, 10);
      if (!isNaN(minY)) {
        filtered = filtered.filter((c) => c.year !== null && c.year >= minY);
      }
    }

    if (maxYear) {
      const maxY = parseInt(maxYear, 10);
      if (!isNaN(maxY)) {
        filtered = filtered.filter((c) => c.year !== null && c.year <= maxY);
      }
    }

    if (minCitations) {
      const minC = parseInt(minCitations, 10);
      if (!isNaN(minC)) {
        filtered = filtered.filter((c) => c.citationCount >= minC);
      }
    }

    // Sort by citation count descending
    filtered.sort((a, b) => b.citationCount - a.citationCount);

    return NextResponse.json({
      paper: result.paper,
      citations: filtered,
      totalCitations: result.totalCitations,
      filteredCount: filtered.length,
      cached: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: `Citation search failed: ${message}` },
      { status }
    );
  }
}
