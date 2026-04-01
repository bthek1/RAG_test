import httpx
from bs4 import BeautifulSoup

_DEFAULT_HEADERS = {"User-Agent": "Mozilla/5.0"}
_STRIP_TAGS = ["script", "style", "nav", "footer", "header", "aside"]


class Scraper:
    """HTTP scraper that strips boilerplate tags and returns clean plain text.

    Args:
        headers: HTTP request headers (defaults to a minimal User-Agent).
        timeout: Request timeout in seconds.
        parser: BeautifulSoup parser (``"html.parser"`` or ``"lxml"``).
    """

    def __init__(
        self,
        headers: dict | None = None,
        timeout: float = 10.0,
        parser: str = "html.parser",
    ) -> None:
        self.headers = headers if headers is not None else dict(_DEFAULT_HEADERS)
        self.timeout = timeout
        self.parser = parser

    def scrape(self, url: str, max_chars: int = 8000) -> str:
        """Fetch *url* and return up to *max_chars* of clean plain text."""
        try:
            resp = httpx.get(
                url,
                headers=self.headers,
                follow_redirects=True,
                timeout=self.timeout,
            )
            resp.raise_for_status()
        except Exception as e:
            return f"[scrape failed: {e}]"

        return self.extract_text(resp.text, max_chars=max_chars)

    def extract_text(self, html: str, max_chars: int = 8000) -> str:
        """Parse *html* and return up to *max_chars* of clean plain text."""
        soup = BeautifulSoup(html, self.parser)
        for tag in soup(_STRIP_TAGS):
            tag.decompose()
        lines = [
            ln
            for ln in soup.get_text(separator="\n", strip=True).splitlines()
            if ln.strip()
        ]
        return "\n".join(lines)[:max_chars]


# ---------------------------------------------------------------------------
# Top-level facade — preserves the original function-based API
# ---------------------------------------------------------------------------

_default_scraper = Scraper()


def scrape(url: str, max_chars: int = 8000) -> str:
    """Scrape *url* using the default :class:`Scraper` instance."""
    return _default_scraper.scrape(url, max_chars=max_chars)
