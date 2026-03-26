from duckduckgo_search import DDGS


def search(query: str, max_results: int = 5) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))
    # returns: [{ "title", "href", "body" }, ...]
