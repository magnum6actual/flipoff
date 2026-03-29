"""Tests for config.json validity and structure."""

from __future__ import annotations

import json
from pathlib import Path

import unittest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / 'config.json'

REQUIRED_CHARSET_CHARS = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
VALID_DYNAMIC_TYPES = {'datetime', 'weather'}


class ConfigJsonTests(unittest.TestCase):
    """Validate config.json structure and values."""

    @classmethod
    def setUpClass(cls):
        with open(CONFIG_PATH) as f:
            cls.config = json.load(f)

    def test_file_is_valid_json(self):
        """config.json must be parseable JSON."""
        with open(CONFIG_PATH) as f:
            data = json.load(f)
        self.assertIsInstance(data, dict)

    # ── Grid ───────────────────────────────────────────────────────

    def test_grid_section_exists(self):
        self.assertIn('grid', self.config)

    def test_grid_cols_is_positive_int(self):
        cols = self.config['grid']['cols']
        self.assertIsInstance(cols, int)
        self.assertGreater(cols, 0)

    def test_grid_rows_is_positive_int(self):
        rows = self.config['grid']['rows']
        self.assertIsInstance(rows, int)
        self.assertGreater(rows, 0)

    # ── Timing ─────────────────────────────────────────────────────

    def test_timing_section_exists(self):
        self.assertIn('timing', self.config)

    def test_timing_has_required_keys(self):
        required = {
            'flipStepDuration', 'flipStepFastDuration', 'flipSettleDuration',
            'staggerDelay', 'messageInterval', 'messageDurationSeconds',
            'apiMessageDurationSeconds',
        }
        self.assertTrue(required.issubset(self.config['timing'].keys()))

    def test_timing_values_are_positive_numbers(self):
        for key, value in self.config['timing'].items():
            self.assertIsInstance(value, (int, float), f'timing.{key} must be a number')
            self.assertGreater(value, 0, f'timing.{key} must be positive')

    def test_flip_step_fast_is_faster_than_normal(self):
        t = self.config['timing']
        self.assertLessEqual(t['flipStepFastDuration'], t['flipStepDuration'])

    # ── Charset ────────────────────────────────────────────────────

    def test_charset_exists_and_is_string(self):
        self.assertIn('charset', self.config)
        self.assertIsInstance(self.config['charset'], str)

    def test_charset_contains_required_characters(self):
        charset = set(self.config['charset'])
        missing = REQUIRED_CHARSET_CHARS - charset
        self.assertEqual(missing, set(), f'Charset missing required chars: {missing}')

    def test_charset_has_no_duplicate_characters(self):
        charset = self.config['charset']
        self.assertEqual(len(charset), len(set(charset)), 'Charset has duplicate characters')

    def test_charset_includes_parentheses(self):
        charset = self.config['charset']
        self.assertIn('(', charset)
        self.assertIn(')', charset)

    # ── Accent Colors ──────────────────────────────────────────────

    def test_accent_colors_is_list(self):
        self.assertIn('accentColors', self.config)
        self.assertIsInstance(self.config['accentColors'], list)

    def test_accent_colors_are_hex(self):
        for color in self.config['accentColors']:
            self.assertRegex(color, r'^#[0-9A-Fa-f]{6}$', f'Invalid hex color: {color}')

    def test_accent_colors_not_empty(self):
        self.assertGreater(len(self.config['accentColors']), 0)

    # ── Messages ───────────────────────────────────────────────────

    def test_messages_is_list(self):
        self.assertIn('messages', self.config)
        self.assertIsInstance(self.config['messages'], list)

    def test_messages_not_empty(self):
        self.assertGreater(len(self.config['messages']), 0)

    def test_each_message_is_valid(self):
        rows = self.config['grid']['rows']
        for i, msg in enumerate(self.config['messages']):
            if isinstance(msg, dict):
                # Dynamic message marker
                self.assertIn('dynamic', msg, f'Message {i}: object must have "dynamic" key')
                self.assertIn(msg['dynamic'], VALID_DYNAMIC_TYPES,
                              f'Message {i}: unknown dynamic type "{msg["dynamic"]}"')
            elif isinstance(msg, list):
                self.assertEqual(len(msg), rows,
                                 f'Message {i}: has {len(msg)} lines, expected {rows}')
                for j, line in enumerate(msg):
                    self.assertIsInstance(line, str,
                                         f'Message {i}, line {j}: must be a string')
            else:
                self.fail(f'Message {i}: must be a list or dynamic marker object, got {type(msg).__name__}')

    def test_message_lines_fit_grid_width(self):
        cols = self.config['grid']['cols']
        charset = self.config['charset']
        for i, msg in enumerate(self.config['messages']):
            if not isinstance(msg, list):
                continue
            for j, line in enumerate(msg):
                # Count grapheme clusters (emojis count as 1 visual char)
                # Simple heuristic: strip known multi-byte emoji sequences
                visual_len = len(line)
                # Allow some slack for emojis (they render as 1 tile width)
                # but warn if the plain text is obviously too long
                plain = ''.join(c for c in line if ord(c) < 0x1F000)
                if len(plain) > cols:
                    self.fail(f'Message {i}, line {j}: text portion "{plain}" '
                              f'is {len(plain)} chars, exceeds grid width {cols}')

    def test_dynamic_messages_have_matching_providers(self):
        dynamic_types = set()
        for msg in self.config['messages']:
            if isinstance(msg, dict) and 'dynamic' in msg:
                dynamic_types.add(msg['dynamic'])
        for dt in dynamic_types:
            self.assertIn(dt, VALID_DYNAMIC_TYPES, f'No provider for dynamic type "{dt}"')

    def test_no_dash_attribution_style(self):
        """Attribution should use (AUTHOR) not - AUTHOR."""
        for i, msg in enumerate(self.config['messages']):
            if not isinstance(msg, list):
                continue
            for j, line in enumerate(msg):
                stripped = line.strip()
                if stripped.startswith('- ') and stripped[2:].replace(' ', '').isalpha():
                    self.fail(f'Message {i}, line {j}: uses "- AUTHOR" style, '
                              f'should use "(AUTHOR)" instead: "{line}"')


if __name__ == '__main__':
    unittest.main()
