"""Question segmentation from OCR output.

The cases that matter here are the ones where the OCR returns a question label
inside maths markup rather than as plain text, which happens whenever a student
writes the label and the formula on the same line ("Q2 ∫(3x²+4x-5)dx"). That
used to hide the label from the line-anchored matcher, silently merging the
answer into the previous question and leaving the real one blank.
"""
from app.utils.question_detector import detect_questions


def _numbers(questions):
    return [q["question_number"] for q in questions]


def test_plain_paragraphs_split_into_questions():
    html = "<p>Q1 Polymorphism is an OOP concept.</p><p>Q2 An integral.</p>"
    questions = detect_questions(html)

    assert _numbers(questions) == ["1", "2"]
    assert "Polymorphism" in questions[0]["text_content"]
    assert "integral" in questions[1]["text_content"]


def test_label_inside_block_math_still_splits():
    """The reported failure: OCR wrapped 'Q2 ∫(3x²+4x-5)dx' in a display-math
    element, so everything from Q1 onward was handed to Q1 and Q2 came back
    empty."""
    html = (
        "<p>Q1. Polymorphism is an OOP concept.</p>"
        '<math display="block">Q2 \\int(3x^2+4x-5)dx</math>'
        "<p>Solution:</p>"
    )
    questions = detect_questions(html)

    assert _numbers(questions) == ["1", "2"]
    assert "Polymorphism" in questions[0]["text_content"]
    assert "Q2" not in questions[0]["text_content"]

    q2 = questions[1]["text_content"]
    assert q2, "Q2 body must not be empty"
    assert "\\int(3x^2+4x-5)dx" in q2
    assert "\\[" in q2 and "\\]" in q2, "formula should keep its KaTeX delimiters"


def test_label_inside_inline_math_still_splits():
    html = "<p>Q1 First answer.</p><math>Q2 \\int x^2 dx</math>"
    questions = detect_questions(html)

    assert _numbers(questions) == ["1", "2"]
    assert "\\int x^2 dx" in questions[1]["text_content"]


def test_label_inside_dollar_delimited_math_still_splits():
    """Dollar-delimited maths is plain text and never reaches the <math>
    handling, so it needs its own hoist."""
    html = "<p>Q1 First answer.</p>\n$$Q2 \\int(3x^2)dx$$"
    questions = detect_questions(html)

    assert _numbers(questions) == ["1", "2"]
    assert "\\int(3x^2)dx" in questions[1]["text_content"]


def test_math_only_label_yields_empty_body_not_a_missing_question():
    html = "<p>Q1 First answer.</p><math>Q2</math>"
    questions = detect_questions(html)

    assert _numbers(questions) == ["1", "2"]


def test_written_period_is_not_left_at_head_of_body():
    questions = detect_questions("<p>Q1. Polymorphism is an OOP concept.</p>")

    assert questions[0]["text_content"].startswith("Polymorphism")


def test_variable_named_q1_is_not_treated_as_a_label():
    """On a physics script 'Q1 = 5 C' is a charge, not a question label — it
    must stay inside the maths rather than splitting the answer."""
    html = "<p>Q1 Find the charge.</p><math>Q1 = 5\\,\\text{C}</math>"
    questions = detect_questions(html)

    assert _numbers(questions) == ["1"]
    assert "Q1 = 5" in questions[0]["text_content"]


def test_ordering_preserved_across_three_questions():
    html = (
        "<p>Q1 First.</p>"
        '<math display="block">Q2 x^2</math>'
        "<p>Q3 Third.</p>"
    )
    questions = detect_questions(html)

    assert _numbers(questions) == ["1", "2", "3"]
    assert "First" in questions[0]["text_content"]
    assert "Third" in questions[2]["text_content"]


def test_lettered_subquestion_numbers_preserved():
    html = "<p>Q1a First part.</p><p>Q1b Second part.</p>"
    questions = detect_questions(html)

    assert _numbers(questions) == ["1a", "1b"]
