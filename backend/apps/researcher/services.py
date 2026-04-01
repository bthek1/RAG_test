from .scraper import scrape
from .search import DDGClient


def run_search(
    query: str,
    max_results: int = 5,
    type: str = "all",
    sort: str = "relevance",
) -> list[dict]:
    """Run a search and return scraped results.

    Routes to the appropriate DDGClient method based on *type*.
    ``sort`` is accepted for API compatibility but not yet enforced by the
    underlying search provider.
    """
    client = DDGClient(max_results=max_results)

    if type == "news":
        raw = client.news(query, max_results=max_results)
    elif type == "video":
        raw = client.videos(query, max_results=max_results)
    elif type == "image":
        raw = client.images(query, max_results=max_results)
    else:  # "web" or "all"
        raw = client.text(query, max_results=max_results)

    results: list[dict] = []
    for r in raw:
        result_type = r.get("type", "web")
        entry: dict = {
            "type": result_type,
            "title": r.get("title", ""),
            "url": r.get("href", ""),
            "snippet": r.get("body", ""),
            "scraped_text": scrape(r.get("href", "")),
        }
        if result_type == "news":
            entry["source"] = r.get("source", "")
            entry["published_at"] = r.get("published_at", "")
        elif result_type == "video":
            entry["video_url"] = r.get("video_url", "")
            entry["thumbnail_url"] = r.get("thumbnail_url", "")
        elif result_type == "image":
            image_url = r.get("image_url", "")
            entry["images"] = [image_url] if image_url else []
            entry["original_url"] = r.get("href", "")
        results.append(entry)

    return results
