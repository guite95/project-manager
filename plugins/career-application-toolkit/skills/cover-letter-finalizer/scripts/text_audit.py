#!/usr/bin/env python3
"""Count an exact essay body and flag unfinished-editing marker candidates.

Python 3.9+, standard library only. Does not verify facts, writing quality,
AI authorship, or the counting rules of any application website.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

METRICS = (
    'codepoints',
    'codepoints_no_ascii_spaces',
    'codepoints_no_whitespace',
    'utf8_bytes',
    'utf16_units',
)
NEWLINE_MODES = ('preserve', 'lf', 'remove')
MARKERS = (
    ('review_marker', re.compile(r'\[(?:확인\s*필요|미확인|미작성|검토\s*필요)(?:\s*[:：][^\]\r\n]{0,120})?\]')),
    ('template_field', re.compile(r'\[(?:회사명|직무명|지원동기\s*입력|경험\s*입력|성과\s*입력|수치\s*입력)\]')),
    ('template_braces', re.compile(r'\{\{[^{}\r\n]{1,120}\}\}')),
    ('todo_marker', re.compile(r'(?<!\w)(?:TODO|TBD)(?!\w)')),
)


def normalize_newlines(text: str, mode: str) -> str:
    """Only transform CRLF/CR/LF when explicitly requested."""
    if mode not in NEWLINE_MODES:
        raise ValueError('Unsupported newline mode: ' + str(mode))
    if mode == 'preserve':
        return text
    normalized = text.replace('\r\n', '\n').replace('\r', '\n')
    return normalized if mode == 'lf' else normalized.replace('\n', '')


def count_metrics(text: str) -> Dict[str, int]:
    """Return explicitly named counting schemes without stripping the input."""
    return {
        'codepoints': len(text),
        'codepoints_no_ascii_spaces': len(text.replace(' ', '')),
        'codepoints_no_whitespace': sum(not ch.isspace() for ch in text),
        'utf8_bytes': len(text.encode('utf-8')),
        'utf16_units': len(text.encode('utf-16-le')) // 2,
    }


def placeholder_candidates(text: str) -> List[Dict[str, object]]:
    """Find narrow unfinished-editing patterns, not factual errors."""
    found = []
    for kind, pattern in MARKERS:
        for match in pattern.finditer(text):
            found.append({
                'kind': kind,
                'text': match.group(0),
                'start_codepoint': match.start(),
                'end_codepoint': match.end(),
            })
    return sorted(found, key=lambda item: int(item['start_codepoint']))


def analyze(
    text: str,
    metric: str = 'codepoints',
    minimum: Optional[int] = None,
    maximum: Optional[int] = None,
    newline_mode: str = 'preserve',
) -> Dict[str, object]:
    if not isinstance(text, str):
        raise TypeError('text must be a string')
    if metric not in METRICS:
        raise ValueError('Unsupported metric: ' + str(metric))
    for label, value in (('minimum', minimum), ('maximum', maximum)):
        if value is not None and (type(value) is not int or value < 0):
            raise ValueError(label + ' must be a nonnegative integer')
    if minimum is not None and maximum is not None and minimum > maximum:
        raise ValueError('minimum must not exceed maximum')

    counted_text = normalize_newlines(text, newline_mode)
    counts = count_metrics(counted_text)
    selected = counts[metric]
    if minimum is None and maximum is None:
        status = 'not_configured'
    elif minimum is not None and selected < minimum:
        status = 'too_short'
    elif maximum is not None and selected > maximum:
        status = 'too_long'
    else:
        status = 'within_specified_range'

    warnings = []
    if not counted_text:
        warnings.append('empty_text')
    if text.startswith('\ufeff'):
        warnings.append('leading_bom_present_and_counted')
    if counted_text.endswith(('\n', '\r')):
        warnings.append('trailing_linebreak_present_and_counted')

    return {
        'schema_version': '1.0',
        'counting_policy': {
            'newlines': newline_mode,
            'unicode_normalization': 'none',
            'trim_leading_or_trailing_whitespace': False,
            'input_scope': 'all supplied text; caller must isolate the essay body',
            'no_ascii_spaces': 'excludes U+0020 only',
            'no_whitespace': 'excludes characters for which Python str.isspace() is true',
        },
        'counts': counts,
        'limits': {
            'metric': metric,
            'minimum': minimum,
            'maximum': maximum,
            'selected_count': selected,
            'status': status,
        },
        'placeholder_candidates': placeholder_candidates(counted_text),
        'warnings': warnings,
        'scope_note': 'Length and marker checks only. Website equivalence, facts, meaning, and authorship are not verified.',
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', nargs='?', default='-', help='UTF-8 text file, or - for standard input')
    parser.add_argument('--metric', choices=METRICS, default='codepoints')
    parser.add_argument('--min', dest='minimum', type=int)
    parser.add_argument('--max', dest='maximum', type=int)
    parser.add_argument('--newlines', choices=NEWLINE_MODES, default='preserve')
    args = parser.parse_args(argv)
    try:
        # Read bytes so Python does not silently turn CRLF into LF.
        raw = sys.stdin.buffer.read() if args.file == '-' else Path(args.file).read_bytes()
        text = raw.decode('utf-8')
        report = analyze(text, args.metric, args.minimum, args.maximum, args.newlines)
    except (OSError, UnicodeError, ValueError, TypeError) as exc:
        parser.error(str(exc))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
