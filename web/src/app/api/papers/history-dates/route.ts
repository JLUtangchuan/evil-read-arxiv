import { NextResponse } from "next/server";
import { fetchAvailableDates } from "@/lib/github-history";

export async function GET() {
  try {
    const dates = await fetchAvailableDates();
    return NextResponse.json(dates, {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to list history dates: ${message}` },
      { status: 502 }
    );
  }
}
