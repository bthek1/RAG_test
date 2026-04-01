from unittest.mock import MagicMock, patch

import pytest

from apps.researcher.search import search

# The search() facade delegates to DDGClient which wraps DDGS.
# We patch at the search module level since that's where DDGS is imported.
_PATCH_TARGET = "apps.researcher.search.DDGS"


def test_search_returns_results():
    mock_results = [{"title": "T", "href": "https://example.com", "body": "B"}]
    with patch(_PATCH_TARGET) as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = mock_results
        results = search("test query", max_results=1)
    assert len(results) == 1
    assert results[0]["title"] == "T"
    assert results[0]["href"] == "https://example.com"


def test_search_respects_max_results():
    with patch(_PATCH_TARGET) as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = []
        search("q", max_results=3)
        MockDDGS.return_value.__enter__.return_value.text.assert_called_once_with(
            "q", max_results=3
        )


def test_search_returns_empty_list_when_no_results():
    with patch(_PATCH_TARGET) as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = []
        results = search("no results query")
    assert results == []


@pytest.mark.parametrize("max_results", [1, 5, 20])
def test_search_passes_max_results_to_ddgs(max_results):
    with patch(_PATCH_TARGET) as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = []
        search("q", max_results=max_results)
        MockDDGS.return_value.__enter__.return_value.text.assert_called_once_with(
            "q", max_results=max_results
        )
