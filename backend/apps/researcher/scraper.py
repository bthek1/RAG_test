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

    lines = [
        ln
        for ln in soup.get_text(separator="\n", strip=True).splitlines()
        if ln.strip()
    ]
    return "\n".join(lines)[:max_chars]
