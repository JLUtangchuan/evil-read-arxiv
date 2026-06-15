import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);
const PROJECT_ROOT = path.join(process.cwd(), "..");
const SCRIPT_PATH = path.join(PROJECT_ROOT, "scripts", "search_citations.py");

export interface CitationPaper {
  title: string;
  year: number | null;
  citationCount: number;
  authors: string[];
  venue: string;
  externalIds: {
    ArXiv: string;
    DOI: string;
  };
  paperId: string;
  publicationDate: string;
}

export interface MatchedPaper {
  title: string;
  year: number | null;
  citationCount: number;
  paperId: string;
  externalIds: Record<string, string>;
  url: string;
}

export interface CitationsResult {
  paper: MatchedPaper;
  citations: CitationPaper[];
  totalCitations: number;
}

export async function searchCitations(
  title: string,
  maxResults: number = 500
): Promise<CitationsResult> {
  const cmd = `python3 "${SCRIPT_PATH}" "${title.replace(/"/g, '\\"')}" --max-results ${maxResults}`;

  const { stdout } = await execAsync(cmd, {
    cwd: PROJECT_ROOT,
    timeout: 300000,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });

  // Script always exits 0; errors are carried as {"error": "..."} in JSON
  const parsed: CitationsResult & { error?: string } = JSON.parse(stdout.trim());
  if ("error" in parsed && parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed as CitationsResult;
}
