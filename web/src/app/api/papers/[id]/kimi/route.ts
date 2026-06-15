import { NextRequest, NextResponse } from "next/server";
import { marked } from "marked";
import katex from "katex";

const COOL_PAPERS_KIMI_URL = "https://papers.cool/arxiv/kimi";

/**
 * Render LaTeX math expressions inside text to KaTeX HTML.
 * Handles $...$ (inline) and $$...$$ (display/block).
 */
function renderMath(text: string): string {
  // Process display math first ($$...$$) to avoid conflict with inline $
  let result = text.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_: string, formula: string) => {
      try {
        return katex.renderToString(formula.trim(), {
          displayMode: true,
          throwOnError: false,
        });
      } catch {
        return `<span class="katex-error">$${formula}$</span>`;
      }
    }
  );

  // Process inline math ($...$)
  result = result.replace(/\$(.+?)\$/g, (_: string, formula: string) => {
    // Skip if it's a false positive (e.g. $ alone, or $100)
    if (/^\d+(\.\d+)?$/.test(formula.trim())) {
      return `$${formula}$`;
    }
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `<span class="katex-error">$${formula}$</span>`;
    }
  });

  return result;
}

/**
 * Convert Markdown content inside .faq-a divs to HTML,
 * with LaTeX math rendering via KaTeX.
 */
function renderFaqMarkdown(html: string): string {
  return html.replace(
    /<div class="faq-a">([\s\S]*?)<\/div>/g,
    (_match: string, content: string) => {
      const trimmed = content.trim();

      // First render math, protecting formulas from markdown parser
      const mathPlaceholders: Map<string, string> = new Map();
      let idx = 0;

      // Protect display math
      const withDisplayProtected = trimmed.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_: string, formula: string) => {
          const key = `__MATH_DISPLAY_${idx}__`;
          try {
            const rendered = katex.renderToString(formula.trim(), {
              displayMode: true,
              throwOnError: false,
            });
            mathPlaceholders.set(key, rendered);
          } catch {
            mathPlaceholders.set(
              key,
              `<span class="katex-error">$${formula}$</span>`
            );
          }
          idx++;
          return key;
        }
      );

      // Protect inline math
      const withInlineProtected = withDisplayProtected.replace(
        /\$(.+?)\$/g,
        (_: string, formula: string) => {
          if (/^\d+(\.\d+)?$/.test(formula.trim())) {
            return `$${formula}$`;
          }
          const key = `__MATH_INLINE_${idx}__`;
          try {
            const rendered = katex.renderToString(formula.trim(), {
              displayMode: false,
              throwOnError: false,
            });
            mathPlaceholders.set(key, rendered);
          } catch {
            mathPlaceholders.set(
              key,
              `<span class="katex-error">$${formula}$</span>`
            );
          }
          idx++;
          return key;
        }
      );

      // Convert Markdown to HTML
      const renderedMarkdown = marked.parse(withInlineProtected, {
        async: false,
      }) as string;

      // Restore math placeholders with rendered KaTeX HTML
      let result = renderedMarkdown;
      for (const [key, value] of mathPlaceholders) {
        result = result.replace(key, value);
      }

      return `<div class="faq-a">${result}</div>`;
    }
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const rawId = decodeURIComponent(id);
  const paperId = rawId.replace(/v\d+$/, "");

  if (!paperId) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(
      `${COOL_PAPERS_KIMI_URL}?paper=${encodeURIComponent(paperId)}`,
      {
        method: "POST",
        headers: {
          "User-Agent": "evil-read-arxiv/1.0",
          Accept: "text/html, */*",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Cool Papers API returned ${response.status}` },
        { status: 502 }
      );
    }

    const rawHtml = await response.text();
    const processedHtml = renderFaqMarkdown(rawHtml);

    return new NextResponse(processedHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Cool Papers request timed out" },
        { status: 504 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch Kimi summary: ${message}` },
      { status: 500 }
    );
  }
}
