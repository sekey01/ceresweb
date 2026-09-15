import re
from typing import List, Dict, Optional

from lxml import etree
from lxml import html as lxml_html

QUESTION_LABEL_PATTERN = re.compile(
    r'(?:^|\n)\s*((?:Q|q|Question|question|QUESTION)\s*\.?\s*(\d+[a-zA-Z]?))\b',
    re.MULTILINE
)

# A question label sitting at the very start of a math expression. When a
# student writes the label and the formula on one line ("Q2 ∫(3x²+4x-5)dx"),
# the OCR reads the whole line as maths and returns the label inside the math
# markup — where the line-anchored QUESTION_LABEL_PATTERN above can never see
# it, so that question's answer silently merges into the previous one.
#
# The (?!\s*=) guard keeps genuine variables out of it: on a physics script
# "Q1 = 5\,\text{C}" is a charge, not a question label, and must stay as maths.
_LEADING_LABEL_RE = re.compile(
    r'^((?:Q|q|Question|question|QUESTION)\s*\.?\s*\d+[a-zA-Z]?)\b(?!\s*=)[\s.:)]*'
)

# Same problem, but for maths the OCR delimits with dollars in plain text
# rather than a <math> element — that form never reaches _convert_math_tags.
_DOLLAR_LABEL_RE = re.compile(
    r'(?:^|\n)[^\S\n]*(\$\$?)[^\S\n]*'
    r'((?:Q|q|Question|question|QUESTION)\s*\.?\s*\d+[a-zA-Z]?)\b(?!\s*=)[\s.:)]*'
)

_HTML_TAG_RE = re.compile(r'<[^>]+>')
# Both ends of a block element, not just the closing tag: content that follows
# inline text (a hoisted formula, say) would otherwise stay on the same line as
# it, hiding a question label that opens the next paragraph.
_BLOCK_BOUNDARY_RE = re.compile(
    r'<br\s*/?>|</?(?:p|div|li|tr|h[1-6])(?:\s[^>]*)?>',
    re.IGNORECASE
)


def _clean_text(s: Optional[str]) -> str:
    return re.sub(r'\s+', ' ', s or '').strip()


def _replace_with_text(el, text: str) -> None:
    """Replaces an lxml element in-place with a plain text node, merging
    it into the previous sibling's tail (or the parent's text, if it's the
    first child) so the surrounding structure is preserved for the rest of
    the block-boundary/tag-stripping pass."""
    parent = el.getparent()
    if parent is None:
        return
    tail = el.tail or ''
    prev = el.getprevious()
    if prev is not None:
        prev.tail = (prev.tail or '') + text + tail
    else:
        parent.text = (parent.text or '') + text + tail
    parent.remove(el)


def _convert_math_tags(root) -> None:
    """Converts Datalab OCR's <math>/<math display="block"> tags into the
    \\(...\\) / \\[...\\] delimiters the frontend's KaTeX renderer looks
    for. Stripping them as plain tags (the old behaviour) discarded the
    only signal that the enclosed text was math at all, so it rendered as
    literal backslash-LaTeX source instead of a formula."""
    for math_el in list(root.iter('math')):
        latex = _clean_text(math_el.text_content())
        if not latex:
            _replace_with_text(math_el, '')
            continue

        # Hoist a leading question label back out into plain text on its own
        # line, leaving only the formula inside the delimiters. Without this
        # the '\[' lands directly against the label and detect_questions()
        # can't match it — see _LEADING_LABEL_RE.
        prefix = ''
        label_match = _LEADING_LABEL_RE.match(latex)
        if label_match:
            prefix = '\n' + label_match.group(1) + '\n'
            latex = latex[label_match.end():].strip()
            if not latex:
                _replace_with_text(math_el, prefix)
                continue

        wrapped = f'\\[{latex}\\]' if math_el.get('display') == 'block' else f'\\({latex}\\)'
        _replace_with_text(math_el, prefix + wrapped)


def _cell_lines(cell) -> List[str]:
    """One 'line' per <li> if the cell holds a bulleted list, else one
    line for the whole cell — keeps list items aligned by index with
    their counterpart in a sibling cell instead of losing the row
    pairing (which is what happens if each cell's list is just flattened
    independently)."""
    items = cell.findall('.//li')
    if items:
        return [_clean_text(li.text_content()) for li in items] or ['']
    return [_clean_text(cell.text_content())]


def _escape_md_cell(text: str) -> str:
    """Escapes markdown/table-syntax-significant characters so OCR'd cell
    content (e.g. a literal '*' or '_' in the student's answer) displays
    literally instead of being misread as formatting or breaking the
    table's column delimiters."""
    return re.sub(r'([\\|*_`])', r'\\\1', text)


def _convert_tables(root) -> None:
    """Converts <table> elements into a GFM markdown table, pairing cells
    row-by-row (and list items within a cell index-by-index) so a
    two-column comparison table renders as an actual table in the
    frontend instead of flattening into disconnected bullet lists or
    plain 'cellA | cellB' text lines."""
    for table in list(root.iter('table')):
        rows = []
        for row in table.findall('.//tr'):
            cells = row.findall('./td') + row.findall('./th')
            if not cells:
                continue
            per_cell = [_cell_lines(c) for c in cells]
            for i in range(max(len(c) for c in per_cell)):
                rows.append([_escape_md_cell(c[i] if i < len(c) else '') for c in per_cell])

        if not rows:
            continue

        col_count = max(len(r) for r in rows)
        padded = [r + [''] * (col_count - len(r)) for r in rows]
        lines = ['| ' + ' | '.join(r) + ' |' for r in padded]
        lines.insert(1, '|' + '|'.join([' --- '] * col_count) + '|')
        _replace_with_text(table, '\n\n' + '\n'.join(lines) + '\n\n')


def _strip_html(text: str) -> str:
    """Strip HTML tags and decode common entities to plain text.

    Runs a structural pass first (via lxml) to convert <math> tags into
    KaTeX-recognized delimiters and flatten <table> rows into paired text
    lines — both would otherwise be destroyed by naive tag-stripping.
    Block-level boundaries (paragraph/line/row breaks) become newlines
    next, since detect_questions() anchors question labels to the start
    of a line — collapsing everything to spaces would merge every
    question after the first into one line, hiding them from the matcher.
    Falls back to the plain regex pass alone if the input isn't parseable
    as HTML (e.g. it's already plain text).
    """
    try:
        root = lxml_html.fromstring(text)
        _convert_math_tags(root)
        _convert_tables(root)
        text = etree.tostring(root, method='html', encoding='unicode')
    except (etree.ParserError, ValueError):
        pass

    # Dollar-delimited maths arrives as plain text, so it never passes through
    # _convert_math_tags — hoist any leading label out of it the same way.
    text = _DOLLAR_LABEL_RE.sub(lambda m: f'\n{m.group(2)}\n{m.group(1)}', text)

    with_breaks = _BLOCK_BOUNDARY_RE.sub('\n', text)
    plain = _HTML_TAG_RE.sub(' ', with_breaks)
    plain = plain.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&nbsp;', ' ')
    plain = re.sub(r'[^\S\n]*\n[^\S\n]*', '\n', plain)
    plain = re.sub(r'\n{3,}', '\n\n', plain)
    return plain


def detect_questions(ocr_text: str, ocr_metadata: dict = None) -> List[Dict]:
    """
    Detects question labels in OCR text and returns structured list.
    HTML is stripped before detection so tags don't interfere with matching.
    Each item: { label, question_number, start_pos, text_content }
    """
    plain = _strip_html(ocr_text)
    questions = []
    matches = list(QUESTION_LABEL_PATTERN.finditer(plain))

    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(plain)
        # The capture stops at the number, so a written "Q1." leaves its
        # separator behind at the head of the body.
        body = re.sub(r'^\s*[.):\-]\s*', '', plain[match.end():end])
        questions.append({
            "label": match.group(1).strip(),
            "question_number": match.group(2).strip(),
            "start_pos": start,
            "text_content": body.strip()
        })

    return questions
