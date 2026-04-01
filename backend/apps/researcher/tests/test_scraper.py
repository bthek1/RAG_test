from unittest.mock import MagicMock, patch

from apps.researcher.scraper import Scraper, scrape


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
    with patch("apps.researcher.scraper.httpx.get", side_effect=Exception("timeout")):
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


# ---------------------------------------------------------------------------
# Scraper class tests
# ---------------------------------------------------------------------------


def test_scraper_custom_headers_forwarded():
    mock_resp = MagicMock()
    mock_resp.text = "<p>content</p>"
    mock_resp.raise_for_status.return_value = None
    custom_headers = {"User-Agent": "MyBot/1.0", "Accept": "text/html"}
    scraper = Scraper(headers=custom_headers)
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp) as mock_get:
        scraper.scrape("https://example.com")
        _, kwargs = mock_get.call_args
        assert kwargs["headers"] == custom_headers


def test_scraper_custom_timeout_forwarded():
    mock_resp = MagicMock()
    mock_resp.text = "<p>content</p>"
    mock_resp.raise_for_status.return_value = None
    scraper = Scraper(timeout=30.0)
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp) as mock_get:
        scraper.scrape("https://example.com")
        _, kwargs = mock_get.call_args
        assert kwargs["timeout"] == 30.0


def test_scraper_extract_text_strips_tags():
    scraper = Scraper()
    html = (
        "<html><body>"
        "<nav>Nav</nav><header>Header</header>"
        "<p>Main content</p>"
        "<footer>Footer</footer>"
        "</body></html>"
    )
    result = scraper.extract_text(html)
    assert "Main content" in result
    assert "Nav" not in result
    assert "Header" not in result
    assert "Footer" not in result


def test_scraper_extract_text_respects_max_chars():
    scraper = Scraper()
    html = f"<p>{'a' * 5000}</p>"
    result = scraper.extract_text(html, max_chars=100)
    assert len(result) <= 100


def test_scraper_returns_failure_string_on_http_error():
    scraper = Scraper()
    with patch(
        "apps.researcher.scraper.httpx.get", side_effect=Exception("connection error")
    ):
        result = scraper.scrape("https://example.com")
    assert result.startswith("[scrape failed")
