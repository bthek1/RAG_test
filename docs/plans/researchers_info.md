## Free Python Researcher — Complete Plan

---

### Stack

| Layer | Tool | Why |
|---|---|---|
| Search | DuckDuckGo (`duckduckgo-search`) | Free, no API key |
| Content extraction | `httpx` + `BeautifulSoup4` | Scrape full page text |
| Summarisation | Ollama (local LLM) or Anthropic API | Free local or existing key |
| Orchestration | Plain Python or LangChain-free loop | No extra dependencies |

---

### 1. Install

```bash
uv add duckduckgo-search httpx beautifulsoup4 ollama
```

---

### 2. Search

```python
# researcher/search.py
from duckduckgo_search import DDGS

def search(query: str, max_results: int = 5) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))

# returns: [{ "title", "href", "body" }, ...]
```

---

### 3. Scrape full page content

```python
# researcher/scraper.py
import httpx
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0"}

def scrape(url: str, max_chars: int = 8000) -> str:
    try:
        resp = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        return f"[scrape failed: {e}]"

    soup = BeautifulSoup(resp.text, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)

    # collapse blank lines
    lines = [l for l in text.splitlines() if l.strip()]
    return "\n".join(lines)[:max_chars]
```

`max_chars` keeps each page within LLM context limits.

---

### 4. Summarise with local LLM (Ollama)

```python
# researcher/llm.py
import ollama

def summarise(content: str, query: str) -> str:
    prompt = f"""
You are a research assistant. Given the following web page content,
extract only the information relevant to: "{query}"

Be concise. If the page is irrelevant, say so in one sentence.

--- PAGE CONTENT ---
{content}
"""
    response = ollama.chat(
        model="llama3.2",   # or mistral, phi3, gemma2 — whatever you have pulled
        messages=[{"role": "user", "content": prompt}],
    )
    return response["message"]["content"]


def synthesise(summaries: list[str], query: str) -> str:
    combined = "\n\n---\n\n".join(summaries)
    prompt = f"""
You are a research assistant. Synthesise the following source summaries
into a single, well-structured research report on: "{query}"

Include key findings, common themes, and any contradictions.

--- SUMMARIES ---
{combined}
"""
    response = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": prompt}],
    )
    return response["message"]["content"]
```

---

### 5. Orchestrator — the full pipeline

```python
# researcher/pipeline.py
from .search import search
from .scraper import scrape
from .llm import summarise, synthesise


def research(query: str, max_results: int = 5) -> str:
    print(f"\n🔍 Searching: {query}")
    results = search(query, max_results=max_results)

    summaries = []
    for i, r in enumerate(results, 1):
        url = r["href"]
        print(f"  [{i}/{len(results)}] Scraping: {url}")
        content = scrape(url)
        summary = summarise(content, query)
        summaries.append(f"Source: {url}\n{summary}")
        print(f"  ✓ Summarised")

    print("\n📝 Synthesising final report...")
    report = synthesise(summaries, query)
    return report
```

---

### 6. CLI entrypoint

```python
# main.py
import sys
from researcher.pipeline import research

if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) or input("Research topic: ")
    report = research(query)
    print("\n" + "=" * 60)
    print(report)
```

```bash
uv run python main.py "best practices for RAG chunking strategies"
```

---

### 7. Project structure

```
researcher/
├── pyproject.toml
├── main.py
└── researcher/
    ├── __init__.py
    ├── search.py
    ├── scraper.py
    ├── llm.py
    └── pipeline.py
```

---

### 8. Optional upgrades (still free)

**Save report to file:**
```python
with open("report.md", "w") as f:
    f.write(f"# {query}\n\n{report}")
```

**Parallel scraping with asyncio:**
```bash
uv add anyio
```
```python
import anyio
import httpx

async def scrape_all(urls):
    async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
        tasks = [client.get(url) for url in urls]
        responses = await anyio.gather(*tasks, return_exceptions=True)
    return responses
```

**Deeper research — follow-up queries:**
```python
# After first pass, ask the LLM to generate sub-questions
followup_prompt = f"Given this initial research on '{query}', what 3 follow-up searches would fill gaps?"
# then loop research() on each sub-question
```

---

### Ollama setup (if not already running)

```bash
# install from ollama.com, then:
ollama pull llama3.2      # ~2GB, fast
# or
ollama pull mistral       # strong for summarisation
```

Ollama runs a local server at `http://localhost:11434` — completely free, no API key.

---

### Flow summary

```
query
  → DuckDuckGo search  →  5 URLs
  → scrape each URL    →  raw text (trimmed to 8k chars)
  → LLM summarise each →  relevant extract
  → LLM synthesise all →  final research report
```