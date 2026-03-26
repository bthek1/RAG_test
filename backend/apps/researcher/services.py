from .scraper import scrape
from .search import search


def run_search(query: str, max_results: int = 5) -> list[dict]:
    results = search(query, max_results=max_results)
    return [
        {
            "title": r["title"],
            "url": r["href"],
            "snippet": r["body"],
            "scraped_text": scrape(r["href"]),
        }
        for r in results
    ]
