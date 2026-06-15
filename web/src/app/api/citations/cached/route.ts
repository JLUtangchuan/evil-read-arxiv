import { NextRequest, NextResponse } from "next/server";
import { getCachedCitations } from "@/lib/data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paperId = searchParams.get("paperId")?.trim();
  const minYear = searchParams.get("minYear");
  const maxYear = searchParams.get("maxYear");
  const minCitations = searchParams.get("minCitations");

  if (!paperId) {
    return NextResponse.json(
      { error: "Missing 'paperId' query parameter" },
      { status: 400 }
    );
  }

  try {
    const cached = await getCachedCitations(paperId);
    if (!cached) {
      return NextResponse.json({ error: "Cache not found" }, { status: 404 });
    }

    // Apply filters
    let filtered = cached.citations;

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

    filtered.sort((a, b) => b.citationCount - a.citationCount);

    return NextResponse.json({
      paper: cached.paper,
      citations: filtered,
      totalCitations: cached.totalCitations,
      filteredCount: filtered.length,
      cached: true,
      cachedAt: cached.cachedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
