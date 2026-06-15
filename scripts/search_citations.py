#!/usr/bin/env python3
"""Search for papers that cite a given paper via Semantic Scholar API.

Usage:
  python search_citations.py "<paper title>" [--max-results 500] [--output -]

Output: JSON to stdout with matched paper info + list of citing papers.
"""

import sys, os, json, argparse, glob

import requests  # for HTTPError catch

# --- Locate s2.py from the semanticscholar-skill ---
_candidates = [
    os.path.expanduser("~/.claude/skills/semanticscholar-skill"),
    os.path.expanduser("~/.openclaw/skills/semanticscholar-skill"),
    *glob.glob(os.path.expanduser("~/.claude/plugins/**/semanticscholar-skill"), recursive=True),
    *glob.glob(os.path.expanduser("~/.codex/skills/semanticscholar-skill")),
]
SKILL_DIR = next((p for p in _candidates if os.path.isfile(os.path.join(p, "s2.py"))), None)
if SKILL_DIR is None:
    print(json.dumps({"error": "Cannot locate semanticscholar-skill (s2.py not found)"}))
    sys.exit(1)
sys.path.insert(0, SKILL_DIR)
from s2 import match_title, get_citations


def main():
    parser = argparse.ArgumentParser(description="Search citations of a paper")
    parser.add_argument("title", help="Paper title to search for")
    parser.add_argument("--max-results", type=int, default=500, help="Max citations to fetch (default: 500)")
    parser.add_argument("--output", default="-", help="Output path (default: stdout)")
    args = parser.parse_args()

    title = args.title.strip()
    if not title:
        print(json.dumps({"error": "Empty title"}))
        sys.exit(0)

    # Step 1: Match the paper by title
    try:
        match_result = match_title(title)
    except requests.HTTPError:
        print(json.dumps({"error": f"Paper not found for title: {title}"}))
        sys.exit(0)
    # match_title returns {"data": [{...}]}
    data = (match_result or {}).get("data", [])
    if not data:
        print(json.dumps({"error": f"Paper not found for title: {title}"}))
        sys.exit(0)
    paper = data[0]
    if "paperId" not in paper:
        print(json.dumps({"error": f"Paper not found for title: {title}"}))
        sys.exit(0)

    # Step 2: Get citations
    try:
        citations = get_citations(
            paper["paperId"],
            max_results=args.max_results,
            fields="title,year,citationCount,authors,venue,externalIds,publicationDate",
        )
    except Exception as e:
        print(json.dumps({"error": f"Failed to fetch citations: {e}"}))
        sys.exit(0)

    # Step 3: Format output
    result = {
        "paper": {
            "title": paper.get("title", ""),
            "year": paper.get("year"),
            "citationCount": paper.get("citationCount", 0),
            "paperId": paper.get("paperId", ""),
            "externalIds": paper.get("externalIds") or {},
            "url": paper.get("url", ""),
        },
        "citations": [],
        "totalCitations": len(citations),
    }

    for c in citations:
        cp = c.get("citingPaper") or {}
        ext = cp.get("externalIds") or {}
        authors = cp.get("authors") or []
        result["citations"].append({
            "title": cp.get("title", ""),
            "year": cp.get("year"),
            "citationCount": cp.get("citationCount", 0),
            "authors": [a.get("name", "") for a in authors[:10]],
            "venue": cp.get("venue", ""),
            "externalIds": {
                "ArXiv": ext.get("ArXiv", ""),
                "DOI": ext.get("DOI", ""),
            },
            "paperId": cp.get("paperId", ""),
            "publicationDate": cp.get("publicationDate", ""),
        })

    output = json.dumps(result, ensure_ascii=False)
    if args.output == "-":
        print(output)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)


if __name__ == "__main__":
    main()
