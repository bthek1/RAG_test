---
description: "Use when creating, implementing, or adding a new questionnaire type, questionnaire class, or clinical assessment (e.g. PHQ9, GAD7, DASS, EDE-Q, or any custom questionnaire). Covers build(), calc_metrics(), get_metric_formatting(), get_charts(), get_score_bands(), and tests."
---

# Questionnaire Creation Instructions

**BEFORE implementing or modifying any questionnaire**, read both reference documents:

1. `docs/project_docs/technical_guides/GUIDE_QUESTIONNAIRE_CREATION.md` -- step-by-step implementation guide
2. `docs/project_docs/standards/STANDARD_QUESTIONNAIRE_GRAPH_DESIGN.md` -- chart design and style standards

Use `read_file` to load them. Do not proceed without reading them first.

## Core Rules

- **Implement immediately** - do not ask for confirmation on obvious decisions
- **Follow DASS10 as the reference implementation** - it is the gold standard for chart design
- **Never use Django TestCase or unittest.TestCase** - pytest only, always
- **Always enforce metric order consistency** across `calc_metrics()`, `get_metric_formatting()`, and `get_charts()`
- **Always use ASCII characters only** in code, docstrings, and comments (no en dashes, em dashes, multiplication signs)

## File Locations

| Purpose             | Path                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| Questionnaire class | `rmquestionnaire/models/models_questionnairetypes.py`                |
| Test file           | `rmquestionnaire/tests/test_<name_lowercase>.py`                     |
| Graph standards     | `docs/project_docs/standards/STANDARD_QUESTIONNAIRE_GRAPH_DESIGN.md` |
| Creation guide      | `docs/project_docs/technical_guides/GUIDE_QUESTIONNAIRE_CREATION.md` |
| Treatment templates | `rmbase/management/commands/rmbase_setup_treatment_templates.py`     |

## Required Imports (already in file header - do NOT add again)

```python
import logging
import textwrap
from collections import defaultdict
from datetime import UTC, datetime as dt, timedelta

import plotly.graph_objs as go
from faker import Faker
from plotly.colors import qualitative

from .models_questionnaires import Choice, Questionnaire
```

## Class Structure

Every questionnaire class MUST have these five components:

```python
class YOURNAME(Questionnaire):
    """Brief clinical description."""

    full_form = "Full Clinical Name of Questionnaire"

    class Meta(Questionnaire.Meta):
        pass

    def build(self): ...
    def calc_metrics(self): ...
    def get_metric_formatting(self): ...
    def get_charts(self, raw_metrics): ...
    def get_score_bands(self): ...
```

## Method 1: `build()`

```python
def build(self):
    self.description = (
        "Instructions for the client about how to complete this questionnaire. "
        "Include time frame (e.g., 'over the past week') and any clinical context."
    )

    header_text = (
        "<h4><strong>Instructions:</strong></h4>"
        "<small>"
        "Please read each statement and select the response that best describes "
        "how much each item has applied to you over the <strong>PAST WEEK</strong>."
        "</small>"
    )

    choices = [
        {"text": "Never", "value": 0},
        {"text": "Sometimes", "value": 1},
        {"text": "Often", "value": 2},
        {"text": "Almost Always", "value": 3},
    ]
    choices = [Choice.objects.create(**choice) for choice in choices]

    questions_list = [
        "I felt anxious.",
        "I felt down and depressed.",
    ]

    for i, question_text in enumerate(questions_list):
        q = self.questions.create(
            header=header_text if i == 0 else "",
            text=question_text,
            type="choice",
            number=i + 1,
            required=True,
        )
        q.choices.set(choices)

    self.save()
    return self
```

### Question Field Reference

```python
self.questions.create(
    header="",       # HTML string, shown above question (first question only)
    text="...",      # Question text
    type="choice",   # choice, multiple_choice, text, int, scale, boolean, nullable_boolean
    number=1,        # Question order (1-based)
    required=True,   # Whether answer is required
    scale_min=0,     # Min value for int/scale types
    scale_max=10,    # Max value for int/scale types
)
```

## Method 2: `calc_metrics()`

Returns an ordered dict -- ORDER IS CRITICAL.

```python
def calc_metrics(self):
    anxiety = (
        self.questions
        .filter(number__in=[1, 3, 5, 7])
        .answered()
        .sum_value()
    )
    depression = (
        self.questions
        .filter(number__in=[2, 4, 6, 8])
        .answered()
        .mean_value()
    )
    if anxiety is not None or depression is not None:
        total_score = (anxiety or 0) + (depression or 0)
    else:
        total_score = None

    return {
        "anxiety": anxiety,
        "depression": depression,
        "total_score": total_score,
    }
```

### Available QuerySet Methods

```python
.answered()      # Only questions with a value
.unanswered()    # Only questions without a value
.missing()       # Required questions without a value
.required()      # Required questions only
.optional()      # Optional questions only
.sum_value()     # Sum of all numeric values (returns None if no answers)
.mean_value()    # Mean of all numeric values (returns None if no answers)
```

## Method 3: `get_metric_formatting()`

MUST match order of `calc_metrics()`.

```python
def get_metric_formatting(self):
    return {
        "anxiety": {"lower": None, "higher": "danger", "equal": None},
        "depression": {"lower": None, "higher": "danger", "equal": None},
        "total_score": {"lower": "success", "higher": "danger", "equal": None},
    }
```

- Clinical symptoms (lower is better): `"lower": "success", "higher": "danger"`
- Positive outcomes (higher is better): `"lower": "danger", "higher": "success"`
- Neutral metric: all `None`

## Method 4: `get_charts()`

```python
def get_charts(self, raw_metrics):
    """Generate chart showing [questionnaire] scores over time."""
    if not raw_metrics:
        return [{"data": [], "layout": {"title": "No [Name] data available"}}]

    metric_keys = {
        "anxiety": "Anxiety",
        "depression": "Depression",
        "total_score": "Total Score",
    }

    timeseries = {
        key: {"x": [], "y": [], "name": label}
        for key, label in metric_keys.items()
    }

    for entry in raw_metrics:
        date = entry.get("submitted_at") or entry.get("appointment_date")
        if not date:
            continue
        for key in metric_keys:
            value = entry.get(key)
            if isinstance(value, (int, float)):
                timeseries[key]["x"].append(date)
                timeseries[key]["y"].append(value)

    all_dates = [d for series in timeseries.values() for d in series["x"]]
    if all_dates:
        start_date = min(all_dates)
        end_date = max(all_dates)
        if (end_date - start_date).days < 7:
            end_date = start_date + timedelta(days=7)
            x_range = [start_date, end_date]
        else:
            x_range = None
    else:
        today = dt.now(UTC).date()
        x_range = [today - timedelta(days=7), today]

    traces = [
        go.Scatter(
            x=ts["x"],
            y=ts["y"],
            mode="lines+markers",
            name=ts["name"],
            line={"shape": "linear", "width": 2},
            marker={"size": 6},
        )
        for ts in timeseries.values()
    ]

    shapes, annotations = bands_to_plotly(self.get_score_bands(), metric=None)

    layout = {
        "title": {
            "text": "[Questionnaire Name] Scores Over Time",
            "x": 0.5,
            "xanchor": "center",
            "font": {"size": 20},
        },
        "xaxis": {
            "title": "Date",
            "tickangle": -45,
            "tickfont": {"size": 12},
            "autorange": x_range is None,
            "range": x_range,
            "gridcolor": "rgba(0,0,0,0.05)",
        },
        "yaxis": {
            "title": "Score",
            "range": [0, 21],  # Set explicit range for your scale
            "tickfont": {"size": 12},
            "gridcolor": "rgba(0,0,0,0.1)",
            "linewidth": 1,
        },
        "plot_bgcolor": "#ffffff",
        "paper_bgcolor": "#ffffff",
        "margin": {"t": 60, "b": 80, "l": 60, "r": 40},
        "legend": {
            "orientation": "h",
            "x": 0.5,
            "xanchor": "center",
            "y": -0.3,
            "font": {"size": 12},
        },
        "shapes": shapes,
        "annotations": annotations,
    }

    return [{"data": traces, "layout": layout}]
```

### Chart Design Rules (NON-NEGOTIABLE)

| Rule                | Correct                         | Wrong                    |
| ------------------- | ------------------------------- | ------------------------ |
| Background          | `"#ffffff"`                     | `"#f9f9f9"`, `"#e6f0ff"` |
| Annotation position | `"x": 0.02`                     | `"x": 1.01`              |
| Annotation anchor   | `"xanchor": "left"`             | `"align": "left"`        |
| X-axis minimum span | 7 days enforced                 | No minimum               |
| Y-axis              | Explicit `range`                | `autorange: True`        |
| Legend              | `"orientation": "h", "y": -0.3` | Vertical or inside plot  |
| Title font          | `"size": 18-20`                 | Smaller than 18          |

## Method 5: `get_score_bands()`

```python
def get_score_bands(self):
    return [
        {
            "label": "Subclinical",
            "min": 0,
            "max": 10,
            "color": "#d4edda",
            "text_color": "#155724",
            "metric": None,
        },
        {
            "label": "Mild",
            "min": 10,
            "max": 14,
            "color": "rgba(255, 255, 0, 0.2)",
            "text_color": "#856404",
            "metric": None,
        },
        {
            "label": "Moderate",
            "min": 14,
            "max": 19,
            "color": "rgba(255, 165, 0, 0.2)",
            "text_color": "#856404",
            "metric": None,
        },
        {
            "label": "Severe",
            "min": 19,
            "max": None,
            "color": "rgba(255, 0, 0, 0.3)",
            "text_color": "#721c24",
            "metric": None,
        },
    ]
```

## Metric Order Consistency (CRITICAL)

All three methods MUST use the SAME metric keys in the SAME ORDER:

```
calc_metrics()     get_metric_formatting()    get_charts() metric_keys
--------------     -----------------------    -------------------------
"anxiety"      ==  "anxiety"              ==  "anxiety"
"depression"   ==  "depression"           ==  "depression"
"total_score"  ==  "total_score"          ==  "total_score"
```

Verify: `pytest rmbase/tests/test_questionnaire_metric_order_consistency.py -v`

## Testing Pattern

Create test file at `rmquestionnaire/tests/test_<name_lowercase>.py`:

```python
"""Tests for <ClassName> questionnaire."""

from datetime import UTC, datetime as dt

import pytest

from rmcore.factories import ClientFactory
from rmquestionnaire.models import YOURCLASS


@pytest.mark.django_db
class TestYOURCLASS:

    def test_questionnaire_creation(self):
        client = ClientFactory()
        q = YOURCLASS.objects.create(name="YOURCLASS", client=client)
        assert q.full_form == "Expected Full Form Name"
        assert q.questions.count() == 10

    def test_calc_metrics_all_answered(self):
        client = ClientFactory()
        q = YOURCLASS.objects.create(name="YOURCLASS", client=client)
        q.answer_randomly()
        metrics = q.calc_metrics()
        assert isinstance(metrics["total_score"], (int, float))

    def test_calc_metrics_no_answers(self):
        client = ClientFactory()
        q = YOURCLASS.objects.create(name="YOURCLASS", client=client)
        metrics = q.calc_metrics()
        assert metrics["total_score"] is None

    def test_metric_order_consistency(self):
        client = ClientFactory()
        q = YOURCLASS.objects.create(name="YOURCLASS", client=client)
        q.answer_randomly()
        calc_keys = list(q.calc_metrics().keys())
        format_keys = list(q.get_metric_formatting().keys())
        for i, key in enumerate(format_keys):
            assert key == calc_keys[i]

    def test_get_charts_with_data(self):
        client = ClientFactory()
        q = YOURCLASS.objects.create(name="YOURCLASS", client=client)
        raw_metrics = [{"submitted_at": dt.now(UTC), "total_score": 5.0}]
        charts = q.get_charts(raw_metrics)
        assert "data" in charts[0]
        assert "layout" in charts[0]
        assert charts[0]["layout"]["plot_bgcolor"] == "#ffffff"

    def test_get_charts_empty_data(self):
        client = ClientFactory()
        q = YOURCLASS.objects.create(name="YOURCLASS", client=client)
        charts = q.get_charts([])
        assert charts is not None

    def test_get_score_bands(self):
        client = ClientFactory()
        q = YOURCLASS.objects.create(name="YOURCLASS", client=client)
        bands = q.get_score_bands()
        assert isinstance(bands, list)
        assert len(bands) > 0
        required_keys = {"label", "min", "max", "color", "text_color", "metric"}
        for band in bands:
            assert required_keys.issubset(band.keys())
```

## Workflow

1. **Gather clinical info**: full name, questions, choices/scale, scoring subscales, clinical cut-offs
2. **Add class** to `rmquestionnaire/models/models_questionnairetypes.py` (append to end of file)
3. **Implement all 5 methods**: `build()`, `calc_metrics()`, `get_metric_formatting()`, `get_charts()`, `get_score_bands()`
4. **Create test file** at `rmquestionnaire/tests/test_<name>.py`
5. **Run tests**: `pytest rmquestionnaire/tests/test_<name>.py -v`
6. **Fix any failures** and re-run until all pass
7. **Run linting**: `ruff check rmquestionnaire/models/models_questionnairetypes.py`
8. **Fix all linting errors** before finishing

## Never Do

- Use Django TestCase or unittest.TestCase
- Use non-ASCII characters (en dashes, em dashes) in code or comments -- use `-` (hyphen) only
- Put annotations on the right side (`x: 1.01`) -- always use left side (`x: 0.02`)
- Use `align: "left"` in annotations -- use `xanchor: "left"` instead
- Use gray/colored backgrounds -- always `#ffffff`
- Skip `get_score_bands()` -- it must always be implemented
- Forget the `class Meta(Questionnaire.Meta): pass` block
- Mix up metric order between `calc_metrics()`, `get_metric_formatting()`, and `get_charts()`
- Use git add, commit, push, merge, or checkout

## Always Do

- Use `from datetime import UTC, datetime as dt` for datetime handling
- Use `dt.now(UTC)` for current time
- Enforce 7-day minimum x-axis range
- Set explicit y-axis `range` (not autorange)
- Handle empty `raw_metrics` at the top of `get_charts()`
- Return `self` at the end of `build()`
- Call `self.save()` before returning from `build()`
