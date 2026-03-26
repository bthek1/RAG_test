from unittest.mock import MagicMock, patch

from apps.researcher.scraper import scrape


def test_scrape_returns_clean_text():
    mock_resp = MagicMock()
    mock_resp.text = (
        "<html><body><p>Hello world</p><script>bad()</script></body></html>"
    )
    mock_resp.raise_for_status.return_value = None
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp):
        result = scrape("https://example.com")
    assert "Hello world" in result
    assert "bad()" not in result


def test_scrape_strips_nav_footer_header_aside():
    mock_resp = MagicMock()
    mock_resp.text = (
        "<html><body>"
        "<nav>Skip this nav</nav>"
        "<header>Skip header</header>"
        "<aside>Skip aside</aside>"
        "<footer>Skip footer</footer>"
        "<p>Keep this</p>"
        "</body></html>"
    )
    mock_resp.raise_for_status.return_value = None
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp):
        result = scrape("https://example.com")
    assert "Keep this" in result
    assert "Skip this nav" not in result
    assert "Skip header" not in result
    assert "Skip aside" not in result
    assert "Skip footer" not in result


def test_scrape_returns_failure_string_on_error():
    with patch(
        "apps.researcher.scraper.httpx.get", side_effect=Exception("timeout")
    ):
        result = scrape("https://example.com")
    assert result.startswith("[scrape failed")


def test_scrape_respects_max_chars():
    mock_resp = MagicMock()
    mock_resp.text = f"<p>{'x' * 10000}</p>"
    mock_resp.raise_for_status.return_value = None
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp):
        result = scrape("https://example.com", max_chars=100)
    assert len(result) <= 100


def test_scrape_uses_correct_headers():
    mock_resp = MagicMock()
    mock_resp.text = "<p>content</p>"
    mock_resp.raise_for_status.return_value = None
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp) as mock_get:
        scrape("https://example.com")
        _, kwargs = mock_get.call_args
        assert kwargs["headers"] == {"User-Agent": "Mozilla/5.0"}
