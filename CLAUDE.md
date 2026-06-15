# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

`evil-read-arxiv` 是一套自动化论文阅读工作流系统。它从 arXiv 和 Semantic Scholar 搜索匹配用户研究兴趣的论文，进行多维度评分和排序，生成 Obsidian 兼容的笔记，提取论文插图，并同时提供 CLI 技能界面和 Next.js 16 Web 应用两种交互方式。

## 常用命令

```bash
# 安装 Python 依赖
pip install -r requirements.txt

# Web 应用 — 安装和运行
cd web && npm install
npm run dev      # 开发模式（热更新），访问 localhost:3000
npm run build    # 生产构建
npm start        # 生产启动
npm run lint     # ESLint

# 独立运行 Python 脚本
python start-my-day/scripts/search_arxiv.py --config config.yaml --output - --top-n 10 --target-date 2026-05-30
python conf-papers/scripts/search_conf_papers.py --year 2025 --conferences "ICLR,CVPR" --output -
python start-my-day/scripts/scan_existing_notes.py --vault /path/to/vault --output index.json
python paper-analyze/scripts/generate_note.py --paper-id "2501.12345" --title "..." --authors "..." --domain "..." --language zh
python extract-paper-images/scripts/extract_images.py [paper_id] [output_dir] [index_path]
python start-my-day/scripts/link_keywords.py --index existing_notes_index.json --input note.md --output note_linked.md
```

## 架构

### 双界面设计

1. **CLI 技能** (`start-my-day/`、`paper-analyze/`、`extract-paper-images/`、`paper-search/`、`conf-papers/`) — 每个技能包含一个 `SKILL.md`（工作流定义）和 `scripts/`（Python 工具脚本）。Claude Code 以斜杠命令的方式调用这些技能。技能之间可以链式调用：`start-my-day` 会对前 3 篇论文自动调用 `extract-paper-images` 和 `paper-analyze`。

2. **Web 应用** (`web/`) — 独立的 Next.js 16 App Router 应用。它通过 `web/src/lib/python-bridge.ts`（`exec()` 封装）以子进程方式调用 `start-my-day/scripts/search_arxiv.py`。AI 摘要和分析通过 `@anthropic-ai/sdk` 完成，API Key 读取优先级为 `data/api_settings.json` > 环境变量 > 代码默认值。

### 共享评分引擎

`start-my-day/scripts/search_arxiv.py` 是核心评分模块，导出了 `calculate_relevance_score()`、`calculate_quality_score()`、`SCORE_MAX` 以及各权重常量。`conf-papers/scripts/search_conf_papers.py` 通过 `sys.path` 操作导入这些函数，复用相同的评分逻辑，但使用不同的权重（三维度：相关性 40% + 热门度 40% + 质量 20%，无新近性维度）。

### 数据流

```
config.yaml（或 $VAULT/99_System/Config/research_interests.yaml）
    → search_arxiv.py / search_conf_papers.py
    → top_papers JSON（arxiv_filtered.json / conf_papers_filtered.json）
    → Claude Code 生成 Obsidian 格式的 markdown 笔记（wikilink、图片）
    → 保存到 $OBSIDIAN_VAULT_PATH/10_Daily/ 或 20_Research/Papers/
```

### Web 应用 API 路由（Next.js App Router）

| 路由 | 用途 |
|------|------|
| `GET /api/papers` | 搜索论文（子进程调用 `search_arxiv.py`，缓存结果，生成 AI 摘要） |
| `POST /api/papers/filter` | 基于 Claude 对已有结果做相关性筛选 |
| `GET /api/papers/[id]/analyze` | Claude 生成四维深度分析 |
| `GET /api/papers/[id]/images` | 通过 `extract_images.py` 提取论文图片 |
| `POST /api/feedback` | 记录论文评分（喜欢/一般/不感兴趣） |
| `POST /api/preferences/update` | 累计 ≥10 条反馈后触发偏好分析 |
| `GET/POST /api/favorites` | 基于文件夹的收藏管理 |
| `GET/POST /api/settings` | 读写 API 设置到 `data/api_settings.json` |

### Web 应用组件架构

- `PapersContext` — 核心状态：搜索模式、日期范围、论文列表、加载状态、反馈
- `FavoritesContext` — 文件夹增删改查、拖拽分类
- `LanguageContext` — 中英文切换，持久化到 localStorage
- `PaperCard` — 卡片式论文展示，支持展开深度分析，移动端滑动手势（`SwipeContainer`）
- `FeedbackButtons` — 喜欢/一般/不感兴趣评分，≥10 条未处理反馈时自动触发偏好更新

### API Key 优先级（Web 应用，`web/src/lib/anthropic.ts`）

1. `data/api_settings.json`（可通过 `/settings` 页面写入）
2. `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` 环境变量
3. 源码中的硬编码默认值（`DEFAULT_API_KEY`、`DEFAULT_BASE_URL`）

标准 Anthropic Key（`sk-ant-*`）使用 `apiKey`；自定义/代理 Key 使用 `authToken`（Bearer 方式）。

## Obsidian 格式约定（极其重要）

生成任何 `.md` 内容时必须遵守以下规则：

- **Wikilink**：始终使用 `[[文件名|显示标题]]` 格式 — 绝不使用裸的 `[[文件名]]`（下划线在显示中会很丑）
- **图片嵌入**：始终使用 `![[filename.png|600]]` — 绝不使用 `![alt](path%20encoded)`（URL 编码在 Obsidian 中不生效）
- **缺失数据占位符**：使用 `--`（两个短横线）— 绝不使用 `---`（三个短横线在 Obsidian 中会被解析为分隔线）
- **Frontmatter 字符串**：始终用双引号包裹
- **标签名**：不能有空格，用短横线连接（如 `Vision-Language`，而不是 `Vision Language`）
- **文件名生成**：使用 `title_to_note_filename()` 函数 — `re.sub(r'[ /\\:*?"<>|]+', '_', title).strip('_')` — 该函数在 `search_arxiv.py` 和 `generate_note.py` 中实现完全相同，以确保 wikilink 路径能正确对应

## 配置文件

- `config.yaml` — 用户研究兴趣配置（领域、关键词、arXiv 分类、优先级、排除关键词）。需复制到 vault 的 `99_System/Config/research_interests.yaml` 供 CLI 技能使用。
- `conf-papers/conf-papers.yaml` — 顶会论文搜索的独立配置（关键词、排除关键词、默认年份、默认会议、top_n）
- `data/api_settings.json` — Web 应用 API Key 和模型设置（运行时创建）
- `OBSIDIAN_VAULT_PATH` 环境变量 — 所有 Python 脚本都依赖此变量；也可回退到 config.yaml 中的 `vault_path` 字段

## 评分系统

### start-my-day（四维度）

| 维度 | 权重 | 评分来源 |
|------|------|---------|
| 相关性 | 40% | 标题关键词匹配 (+0.5)、摘要关键词匹配 (+0.3)、分类匹配 (+1.0) |
| 新近性 | 20% | 距今天数：≤30天=3、≤90天=2、≤180天=1、>180天=0 |
| 热门度 | 30% | influentialCitationCount 归一化到 0-3 分（100=满分） |
| 质量 | 10% | 从摘要启发式推断（强/弱创新词、方法指标、量化结果） |

来自 Semantic Scholar 的高热度论文使用调整权重：相关性 35%、新近性 10%、热门度 45%、质量 10%。

### conf-papers（三维度）

相关性 40% + 热门度 40% + 质量 20%。无新近性维度，因为年份由用户指定。

### Focus 模式

当 `search_arxiv.py` 传入 `--focus` 参数时，focus 关键词匹配占主导（标题匹配 = +2.0，摘要匹配 = +1.0），已有兴趣域评分仅贡献 30%。

## 依赖

- **Python**：PyYAML、requests、PyMuPDF (fitz) — 用于搜索脚本、PDF 和图片提取
- **Node.js**：Next.js 16、React 19、TypeScript 5、TailwindCSS 4、@anthropic-ai/sdk、js-yaml
- **外部 API**：arXiv API (export.arxiv.org)、Semantic Scholar API、DBLP API — 均为免费层级；S2 API Key 可选但建议配置
