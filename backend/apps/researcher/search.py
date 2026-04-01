import logging

from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)


class DDGClient:
    """Thin wrapper around duckduckgo_search.DDGS with consistent return shapes.

    All methods return a list of dicts with keys:
        title (str), href (str), body (str), type (str)

    On error, logs the exception and returns an empty list.

    Args:
        max_results: Default maximum results per query (overridable per call).
        ddgs_options: Extra keyword arguments forwarded to DDGS() constructor.
    """

    def __init__(
        self,
        max_results: int = 10,
        ddgs_options: dict | None = None,
    ) -> None:
        self.max_results = max_results
        self._ddgs_options: dict = ddgs_options or {}

    def _limit(self, max_results: int | None) -> int:
        return max_results if max_results is not None else self.max_results

    def text(self, query: str, max_results: int | None = None) -> list[dict]:
        """Search for web pages matching *query*."""
        limit = self._limit(max_results)
        try:
            with DDGS(**self._ddgs_options) as ddgs:
                raw = list(ddgs.text(query, max_results=limit))
            return [
                {
                    "title": r.get("title", ""),
                    "href": r.get("href", ""),
                    "body": r.get("body", ""),
                    "type": "web",
                }
                for r in raw
            ]
        except Exception as exc:
            logger.warning("DDGClient.text failed for %r: %s", query, exc)
            return []

    def news(self, query: str, max_results: int | None = None) -> list[dict]:
        """Search for news articles matching *query*."""
        limit = self._limit(max_results)
        try:
            with DDGS(**self._ddgs_options) as ddgs:
                raw = list(ddgs.news(query, max_results=limit))
            return [
                {
                    "title": r.get("title", ""),
                    "href": r.get("url", r.get("href", "")),
                    "body": r.get("body", ""),
                    "type": "news",
                    "source": r.get("source", ""),
                    "published_at": r.get("date", ""),
                }
                for r in raw
            ]
        except Exception as exc:
            logger.warning("DDGClient.news failed for %r: %s", query, exc)
            return []

    def videos(self, query: str, max_results: int | None = None) -> list[dict]:
        """Search for videos matching *query*."""
        limit = self._limit(max_results)
        try:
            with DDGS(**self._ddgs_options) as ddgs:
                raw = list(ddgs.videos(query, max_results=limit))
            return [
                {
                    "title": r.get("title", ""),
                    "href": r.get("content", r.get("href", "")),
                    "body": r.get("description", ""),
                    "type": "video",
                    "video_url": r.get("content", ""),
                    "thumbnail_url": r.get("images", {}).get("large", "")
                    if isinstance(r.get("images"), dict)
                    else "",
                }
                for r in raw
            ]
        except Exception as exc:
            logger.warning("DDGClient.videos failed for %r: %s", query, exc)
            return []

    def images(self, query: str, max_results: int | None = None) -> list[dict]:
        """Search for images matching *query*."""
        limit = self._limit(max_results)
        try:
            with DDGS(**self._ddgs_options) as ddgs:
                raw = list(ddgs.images(query, max_results=limit))
            return [
                {
                    "title": r.get("title", ""),
                    "href": r.get("url", r.get("href", "")),
                    "body": r.get("title", ""),
                    "type": "image",
                    "thumbnail_url": r.get("thumbnail", ""),
                    "image_url": r.get("image", ""),
                }
                for r in raw
            ]
        except Exception as exc:
            logger.warning("DDGClient.images failed for %r: %s", query, exc)
            return []


def search(query: str, max_results: int = 5) -> list[dict]:
    """Return up to *max_results* web search results for *query*.

    Returns a list of dicts with keys: ``title``, ``href``, ``body``, ``type``.
    """
    return DDGClient(max_results=max_results).text(query, max_results=max_results)
