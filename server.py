from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aiohttp import ClientSession, ClientTimeout, web

from plugins import load_plugins
from plugins.base import PluginContext, PluginField, ScreenPlugin

PROJECT_ROOT = Path(__file__).resolve().parent
USER_DATA_DIR = Path.home() / '.flipoff'
CONFIG_PATH = USER_DATA_DIR / 'config.json'
SCREENS_PATH = USER_DATA_DIR / 'screens.json'

DEFAULT_BOARD_SLUG = 'main'
DEFAULT_BOARD_NAME = 'Main Board'
DEFAULT_COLS = 18
DEFAULT_ROWS = 5
DEFAULT_MESSAGE_DURATION_SECONDS = 4
DEFAULT_API_MESSAGE_DURATION_SECONDS = 30
DEFAULT_MESSAGES = [
    ['', 'GOD IS IN', 'THE DETAILS .', '- LUDWIG MIES', ''],
    ['', 'STAY HUNGRY', 'STAY FOOLISH', '- STEVE JOBS', ''],
    ['', 'GOOD DESIGN IS', 'GOOD BUSINESS', '- THOMAS WATSON', ''],
    ['', 'LESS IS MORE', '', '- MIES VAN DER', 'ROHE'],
    ['', 'MAKE IT SIMPLE', 'BUT SIGNIFICANT', '- DON DRAPER', ''],
    ['', 'HAVE NO FEAR OF', 'PERFECTION', '- SALVADOR DALI', ''],
]
SLUG_PATTERN = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
RESERVED_BOARD_SLUGS = {'admin', 'api', 'css', 'js', 'ws', 'screenshot.png', 'favicon.ico', 'index.html'}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


@dataclass
class DisplayConfig:
    slug: str
    name: str
    cols: int
    rows: int
    default_messages: list[list[str]]
    message_duration_seconds: int
    api_message_duration_seconds: int

    def serialize(self) -> dict[str, Any]:
        return {
            'boardSlug': self.slug,
            'boardName': self.name,
            'cols': self.cols,
            'rows': self.rows,
            'defaultMessages': [message.copy() for message in self.default_messages],
            'messageDurationSeconds': self.message_duration_seconds,
            'apiMessageDurationSeconds': self.api_message_duration_seconds,
        }

    def serialize_settings(self) -> dict[str, Any]:
        return {
            'slug': self.slug,
            'name': self.name,
            'cols': self.cols,
            'rows': self.rows,
            'messageDurationSeconds': self.message_duration_seconds,
            'apiMessageDurationSeconds': self.api_message_duration_seconds,
        }


@dataclass
class MessageState:
    has_override: bool = False
    lines: list[str] = field(default_factory=list)
    updated_at: str | None = None

    def serialize(self) -> dict[str, Any]:
        return {
            'hasOverride': self.has_override,
            'lines': self.lines.copy(),
            'updatedAt': self.updated_at,
        }

    def set_override(self, lines: list[str]) -> None:
        self.has_override = True
        self.lines = lines.copy()
        self.updated_at = _utc_now()

    def clear(self, rows: int) -> None:
        self.has_override = False
        self.lines = [''] * rows
        self.updated_at = None


@dataclass
class AdminPasswordState:
    password: str
    generated: bool = False


@dataclass
class ScreenState:
    screens: list[dict[str, Any]] = field(default_factory=list)
    common_settings: dict[str, Any] = field(default_factory=dict)
    refresh_tasks: dict[str, asyncio.Task] = field(default_factory=dict)


@dataclass
class BoardState:
    config: DisplayConfig
    screens: list[dict[str, Any]] = field(default_factory=list)
    message_state: MessageState = field(default_factory=MessageState)
    refresh_tasks: dict[str, asyncio.Task] = field(default_factory=dict)
    override_task: asyncio.Task | None = None


@dataclass
class BoardRegistry:
    boards: dict[str, BoardState] = field(default_factory=dict)
    default_board_slug: str = DEFAULT_BOARD_SLUG
    common_settings: dict[str, Any] = field(default_factory=dict)


DISPLAY_CONFIG_KEY = web.AppKey('display_config', object)
MESSAGE_STATE_KEY = web.AppKey('message_state', object)
SCREEN_STATE_KEY = web.AppKey('screen_state', object)
BOARD_REGISTRY_KEY = web.AppKey('board_registry', BoardRegistry)
WS_CLIENTS_KEY = web.AppKey('ws_clients', dict)
ADMIN_PASSWORD_STATE_KEY = web.AppKey('admin_password_state', AdminPasswordState)
SESSION_TOKENS_KEY = web.AppKey('session_tokens', set)
CONFIG_PATH_KEY = web.AppKey('config_path', object)
SCREENS_PATH_KEY = web.AppKey('screens_path', object)
PLUGINS_KEY = web.AppKey('plugins', dict)
PLUGIN_HTTP_SESSION_KEY = web.AppKey('plugin_http_session', object)


def slugify(value: str) -> str:
    normalized = re.sub(r'[^a-z0-9]+', '-', value.strip().lower())
    normalized = re.sub(r'-{2,}', '-', normalized).strip('-')
    return normalized


def _coerce_slug(value: Any, field_name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"'{field_name}' must be a string.")

    normalized = slugify(value)
    if not normalized:
        raise ValueError(f"'{field_name}' must contain letters or numbers.")
    if normalized in RESERVED_BOARD_SLUGS:
        raise ValueError(f"'{field_name}' uses a reserved slug.")
    if not SLUG_PATTERN.fullmatch(normalized):
        raise ValueError(f"'{field_name}' must contain only lowercase letters, numbers, and hyphens.")
    return normalized


def _suggest_slug(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        normalized = slugify(value)
        if normalized:
            return normalized
    return fallback


def _make_unique_slug(base_slug: str, seen_slugs: set[str]) -> str:
    candidate = base_slug
    suffix = 2
    while candidate in seen_slugs:
        candidate = f'{base_slug}-{suffix}'
        suffix += 1
    return candidate


def _coerce_int(value: Any, field_name: str, minimum: int, maximum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"'{field_name}' must be an integer.")
    if not minimum <= value <= maximum:
        raise ValueError(f"'{field_name}' must be between {minimum} and {maximum}.")
    return value


def _coerce_bool(value: Any, field_name: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"'{field_name}' must be a boolean.")
    return value


def _coerce_optional_string(value: Any, field_name: str) -> str:
    if value is None:
        return ''
    if not isinstance(value, str):
        raise ValueError(f"'{field_name}' must be a string.")
    return value.strip()


def pad_lines(lines: list[str], rows: int) -> list[str]:
    return lines + [''] * max(0, rows - len(lines))


def center_lines(lines: list[str], rows: int) -> list[str]:
    top_padding = max(0, (rows - len(lines)) // 2)
    bottom_padding = max(0, rows - len(lines) - top_padding)
    return [''] * top_padding + lines + [''] * bottom_padding


def trim_message_lines(message: list[str]) -> list[str]:
    trimmed = message.copy()
    while len(trimmed) > 1 and trimmed[-1] == '':
        trimmed.pop()
    return trimmed


def normalize_message_lines(
    lines: Any,
    *,
    cols: int,
    rows: int,
    field_name: str,
    allow_empty: bool = False,
) -> list[str]:
    if not isinstance(lines, list):
        raise ValueError(f"'{field_name}' must be an array of strings.")
    if not lines and allow_empty:
        return []
    if not 1 <= len(lines) <= rows:
        raise ValueError(f"'{field_name}' must contain between 1 and {rows} items.")

    normalized: list[str] = []
    for index, line in enumerate(lines, start=1):
        if not isinstance(line, str):
            raise ValueError(f"{field_name} line {index} must be a string.")
        normalized_line = line.strip().upper()
        if len(normalized_line) > cols:
            raise ValueError(f"{field_name} line {index} exceeds {cols} characters.")
        normalized.append(normalized_line)

    return trim_message_lines(normalized)


def normalize_default_messages(messages: Any, cols: int, rows: int) -> list[list[str]]:
    if not isinstance(messages, list) or len(messages) == 0:
        raise ValueError("'defaultMessages' must be a non-empty array of message arrays.")

    return [
        pad_lines(
            normalize_message_lines(
                message,
                cols=cols,
                rows=rows,
                field_name=f'defaultMessages[{index}]',
            ),
            rows,
        )
        for index, message in enumerate(messages)
    ]


def normalize_runtime_settings_payload(payload: Any) -> tuple[int, int, int, int]:
    if not isinstance(payload, dict):
        raise ValueError('Request body must be a JSON object.')

    cols = _coerce_int(payload.get('cols'), 'cols', 6, 256)
    rows = _coerce_int(payload.get('rows'), 'rows', 1, 128)
    message_duration_seconds = _coerce_int(
        payload.get('messageDurationSeconds', DEFAULT_MESSAGE_DURATION_SECONDS),
        'messageDurationSeconds',
        1,
        86400,
    )
    api_message_duration_seconds = _coerce_int(
        payload.get('apiMessageDurationSeconds'),
        'apiMessageDurationSeconds',
        1,
        86400,
    )
    return cols, rows, message_duration_seconds, api_message_duration_seconds


def default_display_config(
    *,
    slug: str = DEFAULT_BOARD_SLUG,
    name: str = DEFAULT_BOARD_NAME,
) -> DisplayConfig:
    return DisplayConfig(
        slug=slug,
        name=name,
        cols=DEFAULT_COLS,
        rows=DEFAULT_ROWS,
        default_messages=[message.copy() for message in DEFAULT_MESSAGES],
        message_duration_seconds=DEFAULT_MESSAGE_DURATION_SECONDS,
        api_message_duration_seconds=DEFAULT_API_MESSAGE_DURATION_SECONDS,
    )


def load_config_payload(config_path: Path | None) -> dict[str, Any]:
    if config_path is None or not config_path.exists():
        return {}

    with config_path.open('r', encoding='utf-8') as config_file:
        payload = json.load(config_file)

    if not isinstance(payload, dict):
        raise ValueError('Config file must contain a JSON object.')

    return payload


def normalize_board_settings_entry(payload: Any, *, index: int, seen_slugs: set[str]) -> DisplayConfig:
    if not isinstance(payload, dict):
        raise ValueError(f'Board {index} must be a JSON object.')

    requested_slug = payload.get('slug')
    if requested_slug is None:
        slug = _make_unique_slug(
            _suggest_slug(payload.get('name'), f'board-{index}'),
            seen_slugs,
        )
    else:
        slug = _coerce_slug(requested_slug, f'boards[{index}].slug')
        if slug in seen_slugs:
            raise ValueError(f"Duplicate board slug '{slug}' is not allowed.")

    seen_slugs.add(slug)
    name = _coerce_optional_string(payload.get('name'), f'boards[{index}].name') or slug.replace('-', ' ').title()
    cols, rows, message_duration_seconds, api_message_duration_seconds = normalize_runtime_settings_payload(payload)
    return DisplayConfig(
        slug=slug,
        name=name,
        cols=cols,
        rows=rows,
        default_messages=[],
        message_duration_seconds=message_duration_seconds,
        api_message_duration_seconds=api_message_duration_seconds,
    )


def load_board_configs(config_path: Path | None) -> tuple[list[DisplayConfig], str]:
    payload = load_config_payload(config_path)
    if not payload:
        return [default_display_config()], DEFAULT_BOARD_SLUG

    if isinstance(payload.get('boards'), list):
        seen_slugs: set[str] = set()
        boards = [
            normalize_board_settings_entry(raw_board, index=index, seen_slugs=seen_slugs)
            for index, raw_board in enumerate(payload['boards'], start=1)
        ]
        if not boards:
            raise ValueError("'boards' must contain at least one board.")
        default_board_slug = payload.get('defaultBoardSlug')
        if not isinstance(default_board_slug, str) or default_board_slug not in {board.slug for board in boards}:
            default_board_slug = boards[0].slug
        return boards, default_board_slug

    legacy_slug = DEFAULT_BOARD_SLUG
    cols, rows, message_duration_seconds, api_message_duration_seconds = normalize_runtime_settings_payload(payload)
    return [
        DisplayConfig(
            slug=legacy_slug,
            name=DEFAULT_BOARD_NAME,
            cols=cols,
            rows=rows,
            default_messages=[],
            message_duration_seconds=message_duration_seconds,
            api_message_duration_seconds=api_message_duration_seconds,
        )
    ], legacy_slug


def save_board_settings(
    config_path: Path | None,
    registry: BoardRegistry,
    *,
    admin_password: str,
) -> None:
    if config_path is None:
        return

    config_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'defaultBoardSlug': registry.default_board_slug,
        'boards': [board.config.serialize_settings() for board in registry.boards.values()],
        'pluginCommonSettings': registry.common_settings,
        'adminPassword': admin_password,
    }
    with config_path.open('w', encoding='utf-8') as config_file:
        json.dump(payload, config_file, indent=2)
        config_file.write('\n')


def load_admin_password(config_path: Path | None) -> str | None:
    payload = load_config_payload(config_path)
    raw_password = payload.get('adminPassword')
    if not isinstance(raw_password, str):
        return None
    password = raw_password.strip()
    return password or None


def collect_common_settings_schemas(plugins: dict[str, ScreenPlugin]) -> dict[str, tuple[PluginField, ...]]:
    schemas: dict[str, tuple[PluginField, ...]] = {}
    for plugin in plugins.values():
        namespace = plugin.manifest.common_settings_namespace
        if not namespace:
            continue
        schemas.setdefault(namespace, plugin.manifest.common_settings_schema)
    return schemas


def normalize_schema_values(
    values: Any,
    schema: tuple[PluginField, ...],
    *,
    section_name: str,
) -> dict[str, Any]:
    if values is None:
        values = {}
    if not isinstance(values, dict):
        raise ValueError(f"'{section_name}' must be a JSON object.")

    normalized: dict[str, Any] = {}
    for field in schema:
        raw_value = values.get(field.name, field.default)

        if field.field_type == 'text':
            if raw_value is None:
                raw_value = ''
            if not isinstance(raw_value, str):
                raise ValueError(f"'{section_name}.{field.name}' must be a string.")
            normalized_value = raw_value.strip()
            if field.required and not normalized_value:
                raise ValueError(f"'{section_name}.{field.name}' is required.")
            normalized[field.name] = normalized_value
            continue

        if field.field_type == 'select':
            if raw_value is None:
                raw_value = field.default
            if not isinstance(raw_value, str):
                raise ValueError(f"'{section_name}.{field.name}' must be a string.")
            valid_values = {option.value for option in field.options}
            if raw_value not in valid_values:
                raise ValueError(f"'{section_name}.{field.name}' must be one of the allowed options.")
            normalized[field.name] = raw_value
            continue

        if field.field_type == 'checkbox':
            normalized[field.name] = _coerce_bool(raw_value, f'{section_name}.{field.name}')
            continue

        if field.field_type == 'number':
            if not isinstance(raw_value, (int, float)) or isinstance(raw_value, bool):
                raise ValueError(f"'{section_name}.{field.name}' must be numeric.")
            normalized[field.name] = raw_value
            continue

        raise ValueError(f"Unsupported schema field type '{field.field_type}'.")

    return normalized


def normalize_plugin_common_settings(payload: Any, *, plugins: dict[str, ScreenPlugin]) -> dict[str, Any]:
    schemas = collect_common_settings_schemas(plugins)
    normalized: dict[str, Any] = {}

    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        raise ValueError("'pluginCommonSettings' must be a JSON object.")

    for namespace, schema in schemas.items():
        normalized[namespace] = normalize_schema_values(
            payload.get(namespace),
            schema,
            section_name=f'pluginCommonSettings.{namespace}',
        )

    return normalized


def load_plugin_common_settings(config_path: Path | None, *, plugins: dict[str, ScreenPlugin]) -> dict[str, Any]:
    payload = load_config_payload(config_path)
    if not payload:
        return normalize_plugin_common_settings(None, plugins=plugins)
    return normalize_plugin_common_settings(payload.get('pluginCommonSettings'), plugins=plugins)


def generate_screen_id() -> str:
    return secrets.token_hex(8)


def build_manual_screens_from_messages(
    messages: Any | None,
    *,
    cols: int,
    rows: int,
) -> list[dict[str, Any]]:
    if messages is None:
        messages = [message.copy() for message in DEFAULT_MESSAGES]

    normalized_messages = normalize_default_messages(messages, cols, rows)
    return [
        {
            'id': f'manual-{index + 1}',
            'slug': f'screen-{index + 1}',
            'type': 'manual',
            'name': '',
            'enabled': True,
            'lines': trim_message_lines(message),
        }
        for index, message in enumerate(normalized_messages)
    ]


def load_screens_payload(screens_path: Path | None) -> dict[str, list[dict[str, Any]]]:
    if screens_path is None or not screens_path.exists():
        return {}

    with screens_path.open('r', encoding='utf-8') as screens_file:
        payload = json.load(screens_file)

    if isinstance(payload, dict) and isinstance(payload.get('boards'), list):
        board_payloads: dict[str, list[dict[str, Any]]] = {}
        for index, raw_board in enumerate(payload['boards'], start=1):
            if not isinstance(raw_board, dict):
                raise ValueError(f'Screen board {index} must be a JSON object.')
            slug = _coerce_slug(raw_board.get('slug'), f'boards[{index}].slug')
            raw_screens = raw_board.get('screens')
            if not isinstance(raw_screens, list):
                raise ValueError(f"'boards[{index}].screens' must be an array.")
            board_payloads[slug] = raw_screens
        return board_payloads

    if isinstance(payload, dict) and isinstance(payload.get('screens'), list):
        return {DEFAULT_BOARD_SLUG: payload['screens']}

    raise ValueError("Screens file must contain either 'boards' or 'screens'.")


def serialize_screen_for_storage(screen: dict[str, Any]) -> dict[str, Any]:
    payload = {
        'id': screen['id'],
        'slug': screen['slug'],
        'type': screen['type'],
        'name': screen.get('name', ''),
        'enabled': screen.get('enabled', True),
    }

    if screen['type'] == 'manual':
        payload['lines'] = trim_message_lines(screen['lines'])
        return payload

    payload.update(
        {
            'pluginId': screen['pluginId'],
            'refreshIntervalSeconds': screen['refreshIntervalSeconds'],
            'settings': screen['settings'],
            'design': screen['design'],
            'pluginState': screen.get('pluginState', {}),
            'cachedLines': trim_message_lines(screen.get('cachedLines', [])),
            'lastRefreshedAt': screen.get('lastRefreshedAt'),
            'lastError': screen.get('lastError'),
        }
    )
    return payload


def save_screens(screens_path: Path | None, boards: dict[str, BoardState]) -> None:
    if screens_path is None:
        return

    screens_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'boards': [
            {
                'slug': board.config.slug,
                'screens': [serialize_screen_for_storage(screen) for screen in board.screens],
            }
            for board in boards.values()
        ]
    }
    with screens_path.open('w', encoding='utf-8') as screens_file:
        json.dump(payload, screens_file, indent=2)
        screens_file.write('\n')


def normalize_screens_payload(
    payload: Any,
    *,
    config: DisplayConfig,
    plugins: dict[str, ScreenPlugin],
    existing_screens: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    raw_screens = payload.get('screens') if isinstance(payload, dict) else payload
    if not isinstance(raw_screens, list) or len(raw_screens) == 0:
        raise ValueError("'screens' must be a non-empty array.")

    normalized_screens: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_slugs: set[str] = set()

    for index, raw_screen in enumerate(raw_screens, start=1):
        if not isinstance(raw_screen, dict):
            raise ValueError(f'Screen {index} must be a JSON object.')

        screen_id = raw_screen.get('id') if isinstance(raw_screen.get('id'), str) else generate_screen_id()
        if screen_id in seen_ids:
            raise ValueError(f"Duplicate screen id '{screen_id}' is not allowed.")
        seen_ids.add(screen_id)

        previous_screen = existing_screens.get(screen_id, {})
        raw_slug = raw_screen.get('slug', previous_screen.get('slug'))
        if raw_slug is None:
            suggested_slug = _suggest_slug(
                raw_screen.get('name')
                or previous_screen.get('name')
                or raw_screen.get('pluginId')
                or screen_id,
                f'screen-{index}',
            )
            screen_slug = _make_unique_slug(suggested_slug, seen_slugs)
        else:
            screen_slug = _coerce_slug(raw_slug, f'screens[{index}].slug')
            if screen_slug in seen_slugs:
                raise ValueError(f"Duplicate screen slug '{screen_slug}' is not allowed.")
        seen_slugs.add(screen_slug)

        screen_type = raw_screen.get('type')
        name = _coerce_optional_string(raw_screen.get('name'), f'screens[{index}].name')
        enabled = _coerce_bool(raw_screen.get('enabled', True), f'screens[{index}].enabled')

        if screen_type == 'manual':
            normalized_screens.append(
                {
                    'id': screen_id,
                    'slug': screen_slug,
                    'type': 'manual',
                    'name': name,
                    'enabled': enabled,
                    'lines': normalize_message_lines(
                        raw_screen.get('lines'),
                        cols=config.cols,
                        rows=config.rows,
                        field_name=f'screens[{index}].lines',
                    ),
                }
            )
            continue

        if screen_type == 'plugin':
            plugin_id = raw_screen.get('pluginId')
            if not isinstance(plugin_id, str) or plugin_id not in plugins:
                raise ValueError(f"Screen {index} references an unknown plugin.")

            plugin = plugins[plugin_id]
            refresh_interval_seconds = _coerce_int(
                raw_screen.get('refreshIntervalSeconds', plugin.manifest.default_refresh_interval_seconds),
                f'screens[{index}].refreshIntervalSeconds',
                1,
                86400,
            )
            previous_cached_lines = previous_screen.get('cachedLines', [])
            cached_lines = normalize_message_lines(
                previous_cached_lines,
                cols=config.cols,
                rows=config.rows,
                field_name=f'screens[{index}].cachedLines',
                allow_empty=True,
            )

            normalized_screens.append(
                {
                    'id': screen_id,
                    'slug': screen_slug,
                    'type': 'plugin',
                    'name': name,
                    'enabled': enabled,
                    'pluginId': plugin_id,
                    'refreshIntervalSeconds': refresh_interval_seconds,
                    'settings': normalize_schema_values(
                        raw_screen.get('settings'),
                        plugin.manifest.settings_schema,
                        section_name=f'screens[{index}].settings',
                    ),
                    'design': normalize_schema_values(
                        raw_screen.get('design'),
                        plugin.manifest.design_schema,
                        section_name=f'screens[{index}].design',
                    ),
                    'pluginState': previous_screen.get('pluginState', {}),
                    'cachedLines': cached_lines,
                    'lastRefreshedAt': previous_screen.get('lastRefreshedAt'),
                    'lastError': previous_screen.get('lastError'),
                }
            )
            continue

        raise ValueError(f"Screen {index} must have type 'manual' or 'plugin'.")

    return normalized_screens


def reconcile_screens_for_config_change(
    screens: list[dict[str, Any]],
    *,
    cols: int,
    rows: int,
    plugins: dict[str, ScreenPlugin],
) -> list[dict[str, Any]]:
    reconciled: list[dict[str, Any]] = []

    for screen in screens:
        if screen['type'] == 'manual':
            reconciled.append(
                {
                    **screen,
                    'lines': normalize_message_lines(
                        screen['lines'],
                        cols=cols,
                        rows=rows,
                        field_name=f"screen '{screen['slug']}'",
                    ),
                }
            )
            continue

        plugin = plugins[screen['pluginId']]
        reconciled.append(
            {
                **screen,
                'settings': normalize_schema_values(
                    screen.get('settings'),
                    plugin.manifest.settings_schema,
                    section_name=f"screen '{screen['slug']}'.settings",
                ),
                'design': normalize_schema_values(
                    screen.get('design'),
                    plugin.manifest.design_schema,
                    section_name=f"screen '{screen['slug']}'.design",
                ),
                'pluginState': {},
                'cachedLines': [],
                'lastRefreshedAt': None,
                'lastError': None,
            }
        )

    return reconciled


def resolve_screen_lines(
    screen: dict[str, Any],
    config: DisplayConfig,
    plugins: dict[str, ScreenPlugin],
) -> list[str]:
    if screen['type'] == 'manual':
        return pad_lines(screen['lines'], config.rows)

    plugin = plugins[screen['pluginId']]
    cached_lines = screen.get('cachedLines') or []
    if cached_lines:
        return center_lines(cached_lines, config.rows)

    placeholder_lines = plugin.placeholder_lines(
        settings=screen['settings'],
        design=screen['design'],
        context=PluginContext(cols=config.cols, rows=config.rows),
        error=screen.get('lastError'),
    )
    return center_lines(
        normalize_message_lines(
            placeholder_lines,
            cols=config.cols,
            rows=config.rows,
            field_name=f"screen '{screen['slug']}' placeholder",
        ),
        config.rows,
    )


def resolve_default_messages(
    screens: list[dict[str, Any]],
    config: DisplayConfig,
    plugins: dict[str, ScreenPlugin],
) -> list[list[str]]:
    messages = [
        resolve_screen_lines(screen, config, plugins)
        for screen in screens
        if screen.get('enabled', True)
    ]
    return messages or normalize_default_messages([['NO SCREENS']], config.cols, config.rows)


def sync_board_display_messages(board: BoardState, plugins: dict[str, ScreenPlugin]) -> None:
    board.config.default_messages = resolve_default_messages(board.screens, board.config, plugins)


def sync_all_display_messages(app: web.Application) -> None:
    for board in app[BOARD_REGISTRY_KEY].boards.values():
        sync_board_display_messages(board, app[PLUGINS_KEY])


def build_default_board_state(
    config: DisplayConfig,
    *,
    plugins: dict[str, ScreenPlugin],
) -> BoardState:
    screens = build_manual_screens_from_messages(DEFAULT_MESSAGES, cols=config.cols, rows=config.rows)
    board = BoardState(
        config=config,
        screens=screens,
        message_state=MessageState(lines=[''] * config.rows),
    )
    sync_board_display_messages(board, plugins)
    return board


def build_registry(
    *,
    board_configs: list[DisplayConfig],
    default_board_slug: str,
    common_settings: dict[str, Any],
    screens_by_board: dict[str, list[dict[str, Any]]],
    plugins: dict[str, ScreenPlugin],
) -> BoardRegistry:
    registry = BoardRegistry(default_board_slug=default_board_slug, common_settings=common_settings)

    for config in board_configs:
        raw_screens = screens_by_board.get(config.slug)
        if raw_screens is None:
            board = build_default_board_state(config, plugins=plugins)
        else:
            normalized_screens = normalize_screens_payload(
                raw_screens,
                config=config,
                plugins=plugins,
                existing_screens={},
            )
            board = BoardState(
                config=config,
                screens=normalized_screens,
                message_state=MessageState(lines=[''] * config.rows),
            )
            sync_board_display_messages(board, plugins)
        registry.boards[config.slug] = board

    if registry.default_board_slug not in registry.boards:
        registry.default_board_slug = next(iter(registry.boards))

    return registry


def apply_runtime_display_config(config: DisplayConfig) -> dict[str, Any]:
    return config.serialize()


def build_admin_config_response(board: BoardState, *, default_board_slug: str, has_admin_password: bool) -> dict[str, Any]:
    payload = board.config.serialize_settings()
    payload['isDefault'] = board.config.slug == default_board_slug
    payload['hasAdminPassword'] = has_admin_password
    return payload


def serialize_screen_for_admin(
    screen: dict[str, Any],
    config: DisplayConfig,
    plugins: dict[str, ScreenPlugin],
) -> dict[str, Any]:
    payload = {
        'id': screen['id'],
        'slug': screen['slug'],
        'type': screen['type'],
        'name': screen.get('name', ''),
        'enabled': screen.get('enabled', True),
        'previewLines': resolve_screen_lines(screen, config, plugins),
    }

    if screen['type'] == 'manual':
        payload['lines'] = screen['lines']
        return payload

    plugin = plugins[screen['pluginId']]
    payload.update(
        {
            'pluginId': screen['pluginId'],
            'pluginName': plugin.manifest.name,
            'refreshIntervalSeconds': screen['refreshIntervalSeconds'],
            'settings': screen['settings'],
            'design': screen['design'],
            'pluginState': screen.get('pluginState', {}),
            'lastRefreshedAt': screen.get('lastRefreshedAt'),
            'lastError': screen.get('lastError'),
        }
    )
    return payload


def build_admin_screens_response(app: web.Application, board: BoardState) -> dict[str, Any]:
    plugins = app[PLUGINS_KEY]
    return {
        'boardSlug': board.config.slug,
        'pluginCommonSettings': app[BOARD_REGISTRY_KEY].common_settings,
        'screens': [
            serialize_screen_for_admin(screen, board.config, plugins)
            for screen in board.screens
        ],
        'plugins': [plugin.manifest.serialize() for plugin in plugins.values()],
    }


def build_admin_boards_response(registry: BoardRegistry) -> dict[str, Any]:
    return {
        'defaultBoardSlug': registry.default_board_slug,
        'boards': [
            {
                'slug': board.config.slug,
                'name': board.config.name,
                'isDefault': board.config.slug == registry.default_board_slug,
                'cols': board.config.cols,
                'rows': board.config.rows,
                'messageDurationSeconds': board.config.message_duration_seconds,
                'apiMessageDurationSeconds': board.config.api_message_duration_seconds,
                'screenCount': len(board.screens),
            }
            for board in registry.boards.values()
        ],
    }


def build_message_event(state: MessageState) -> dict[str, Any]:
    return {'type': 'message_state', 'payload': state.serialize()}


def build_config_event(config: DisplayConfig) -> dict[str, Any]:
    return {'type': 'config_state', 'payload': config.serialize()}


def get_default_board(app: web.Application) -> BoardState:
    return app[BOARD_REGISTRY_KEY].boards[app[BOARD_REGISTRY_KEY].default_board_slug]


def sync_legacy_default_app_keys(app: web.Application) -> None:
    default_board = get_default_board(app)
    app[DISPLAY_CONFIG_KEY] = default_board.config
    app[MESSAGE_STATE_KEY] = default_board.message_state
    app[SCREEN_STATE_KEY] = ScreenState(
        screens=default_board.screens,
        common_settings=app[BOARD_REGISTRY_KEY].common_settings,
        refresh_tasks=default_board.refresh_tasks,
    )


def get_board(app: web.Application, board_slug: str | None) -> BoardState | None:
    registry = app[BOARD_REGISTRY_KEY]
    slug = board_slug or registry.default_board_slug
    return registry.boards.get(slug)


def resolve_board_from_query(request: web.Request, *, required: bool = False) -> BoardState | None:
    board_slug = request.query.get('board')
    if board_slug is not None:
        try:
            board_slug = _coerce_slug(board_slug, 'board')
        except ValueError as exc:
            raise web.HTTPBadRequest(
                text=json.dumps({'error': str(exc)}),
                content_type='application/json',
            ) from exc

    board = get_board(request.app, board_slug)
    if board is None and required:
        raise web.HTTPNotFound(
            text=json.dumps({'error': 'Board not found.'}),
            content_type='application/json',
        )
    return board


def get_screen_by_id(board: BoardState, screen_id: str) -> dict[str, Any] | None:
    for screen in board.screens:
        if screen['id'] == screen_id:
            return screen
    return None


def get_screen_by_slug(board: BoardState, screen_slug: str) -> dict[str, Any] | None:
    for screen in board.screens:
        if screen['slug'] == screen_slug:
            return screen
    return None


async def broadcast_event(app: web.Application, board_slug: str, event: dict[str, Any]) -> None:
    clients_by_board = app[WS_CLIENTS_KEY]
    stale_clients = []

    for ws in set(clients_by_board.get(board_slug, set())):
        if ws.closed:
            stale_clients.append(ws)
            continue

        try:
            await ws.send_json(event)
        except ConnectionResetError:
            stale_clients.append(ws)

    for ws in stale_clients:
        clients_by_board.setdefault(board_slug, set()).discard(ws)


async def broadcast_message_state(app: web.Application, board_slug: str) -> None:
    board = get_board(app, board_slug)
    if board is None:
        return
    await broadcast_event(app, board_slug, build_message_event(board.message_state))


async def broadcast_display_config(app: web.Application, board_slug: str) -> None:
    board = get_board(app, board_slug)
    if board is None:
        return
    sync_board_display_messages(board, app[PLUGINS_KEY])
    await broadcast_event(app, board_slug, build_config_event(board.config))


def normalize_message(message: Any, cols: int, rows: int) -> list[str]:
    if not isinstance(message, str):
        raise ValueError("The 'message' field must be a string.")

    collapsed = re.sub(r'\s+', ' ', message.strip())
    if not collapsed:
        return [''] * rows

    words = collapsed.split(' ')
    if any(len(word) > cols for word in words):
        raise ValueError(f"Each word in 'message' must be {cols} characters or fewer.")

    lines: list[str] = []
    current_line = ''

    for word in words:
        candidate = word if not current_line else f'{current_line} {word}'
        if len(candidate) <= cols:
            current_line = candidate
            continue

        lines.append(current_line.upper())
        current_line = word
        if len(lines) >= rows:
            raise ValueError(f"'message' must fit within {rows} lines of {cols} characters.")

    if current_line:
        lines.append(current_line.upper())
    if len(lines) > rows:
        raise ValueError(f"'message' must fit within {rows} lines of {cols} characters.")

    return center_lines(lines, rows)


def normalize_payload(payload: Any, config: DisplayConfig) -> list[str]:
    if not isinstance(payload, dict):
        raise ValueError('Request body must be a JSON object.')

    has_message = 'message' in payload
    has_lines = 'lines' in payload
    if has_message == has_lines:
        raise ValueError("Request body must include exactly one of 'message' or 'lines'.")

    if has_message:
        return normalize_message(payload['message'], config.cols, config.rows)

    return pad_lines(
        normalize_message_lines(
            payload['lines'],
            cols=config.cols,
            rows=config.rows,
            field_name='lines',
        ),
        config.rows,
    )


def is_authenticated(request: web.Request) -> bool:
    session_token = request.cookies.get('flipoff_admin_session')
    return bool(session_token and session_token in request.app[SESSION_TOKENS_KEY])


def require_admin(request: web.Request) -> None:
    if not is_authenticated(request):
        raise web.HTTPUnauthorized(
            text=json.dumps({'error': 'Authentication required.'}),
            content_type='application/json',
        )


def cancel_override_task(board: BoardState) -> None:
    if board.override_task is not None:
        board.override_task.cancel()
        board.override_task = None


async def clear_override(app: web.Application, board_slug: str, *, broadcast: bool = True) -> None:
    board = get_board(app, board_slug)
    if board is None:
        return

    cancel_override_task(board)
    if not board.message_state.has_override:
        return

    board.message_state.clear(board.config.rows)
    if broadcast:
        await broadcast_message_state(app, board_slug)


def schedule_override_clear(app: web.Application, board_slug: str) -> None:
    board = get_board(app, board_slug)
    if board is None:
        return

    cancel_override_task(board)

    async def _expire_override() -> None:
        try:
            await asyncio.sleep(board.config.api_message_duration_seconds)
            await clear_override(app, board_slug)
        except asyncio.CancelledError:
            raise

    board.override_task = asyncio.create_task(_expire_override())


async def refresh_plugin_screen(
    app: web.Application,
    board_slug: str,
    screen_id: str,
    *,
    broadcast: bool,
) -> dict[str, Any] | None:
    board = get_board(app, board_slug)
    if board is None:
        return None

    screen = get_screen_by_id(board, screen_id)
    if screen is None or screen['type'] != 'plugin' or not screen.get('enabled', True):
        return screen

    plugin = app[PLUGINS_KEY][screen['pluginId']]
    config = board.config
    previous_last_error = screen.get('lastError')
    previous_cached_lines = screen.get('cachedLines', []).copy()

    try:
        result = await plugin.refresh(
            settings=screen['settings'],
            design=screen['design'],
            context=PluginContext(cols=config.cols, rows=config.rows),
            http_session=app[PLUGIN_HTTP_SESSION_KEY],
            previous_state=screen.get('pluginState'),
            common_settings=app[BOARD_REGISTRY_KEY].common_settings.get(
                plugin.manifest.common_settings_namespace,
                {},
            ),
        )
        screen['cachedLines'] = normalize_message_lines(
            result.lines,
            cols=config.cols,
            rows=config.rows,
            field_name=f"plugin screen '{screen['slug']}'",
        )
        screen['pluginState'] = result.meta.copy()
        screen['lastRefreshedAt'] = _utc_now()
        screen['lastError'] = None
    except Exception as exc:
        screen['pluginState'] = screen.get('pluginState', {})
        screen['lastError'] = str(exc)

    save_screens(app[SCREENS_PATH_KEY], app[BOARD_REGISTRY_KEY].boards)
    sync_board_display_messages(board, app[PLUGINS_KEY])

    if broadcast and (
        screen.get('lastError') != previous_last_error or screen.get('cachedLines', []) != previous_cached_lines
    ):
        await broadcast_display_config(app, board_slug)

    return screen


async def refresh_all_plugin_screens_for_board(app: web.Application, board_slug: str, *, broadcast: bool) -> None:
    board = get_board(app, board_slug)
    if board is None:
        return

    for screen in board.screens:
        if screen['type'] != 'plugin' or not screen.get('enabled', True):
            continue
        await refresh_plugin_screen(app, board_slug, screen['id'], broadcast=False)

    sync_board_display_messages(board, app[PLUGINS_KEY])
    if broadcast:
        await broadcast_display_config(app, board_slug)


def cancel_plugin_refresh_tasks(board: BoardState) -> None:
    for task in board.refresh_tasks.values():
        task.cancel()
    board.refresh_tasks.clear()


def restart_plugin_refresh_tasks(app: web.Application, board_slug: str) -> None:
    board = get_board(app, board_slug)
    if board is None:
        return

    cancel_plugin_refresh_tasks(board)

    for screen in board.screens:
        if screen['type'] != 'plugin' or not screen.get('enabled', True):
            continue
        board.refresh_tasks[screen['id']] = asyncio.create_task(plugin_refresh_loop(app, board_slug, screen['id']))


async def plugin_refresh_loop(app: web.Application, board_slug: str, screen_id: str) -> None:
    try:
        while True:
            board = get_board(app, board_slug)
            if board is None:
                return
            screen = get_screen_by_id(board, screen_id)
            if screen is None or screen['type'] != 'plugin' or not screen.get('enabled', True):
                return
            await asyncio.sleep(screen['refreshIntervalSeconds'])
            await refresh_plugin_screen(app, board_slug, screen_id, broadcast=True)
    except asyncio.CancelledError:
        raise


def resolve_board_page_slug(request: web.Request) -> str | None:
    raw_slug = request.match_info.get('board_slug')
    if not raw_slug:
        return None
    return _coerce_slug(raw_slug, 'board_slug')


def _json_error(message: str, status: int = 400) -> web.Response:
    return web.json_response({'error': message}, status=status)


async def index_handler(_: web.Request) -> web.Response:
    return web.FileResponse(PROJECT_ROOT / 'index.html')


async def board_handler(request: web.Request) -> web.Response:
    try:
        board_slug = resolve_board_page_slug(request)
    except ValueError as exc:
        return _json_error(str(exc), status=404)

    if get_board(request.app, board_slug) is None:
        return _json_error('Board not found.', status=404)
    return web.FileResponse(PROJECT_ROOT / 'index.html')


async def admin_handler(_: web.Request) -> web.Response:
    return web.FileResponse(PROJECT_ROOT / 'admin.html')


async def get_display_config(request: web.Request) -> web.Response:
    board = resolve_board_from_query(request, required=True)
    sync_board_display_messages(board, request.app[PLUGINS_KEY])
    return web.json_response(apply_runtime_display_config(board.config))


async def get_message(request: web.Request) -> web.Response:
    board = resolve_board_from_query(request, required=True)
    return web.json_response(board.message_state.serialize())


async def post_message(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except Exception:
        return _json_error('Request body must be valid JSON.')

    try:
        board_slug = payload.get('boardSlug')
        board = get_board(request.app, _coerce_slug(board_slug, 'boardSlug') if board_slug is not None else None)
        if board is None:
            return _json_error('Board not found.', status=404)

        screen_slug = payload.get('screenSlug')
        normalized_lines = normalize_payload(payload, board.config)
        if screen_slug is not None:
            screen_slug = _coerce_slug(screen_slug, 'screenSlug')
    except ValueError as exc:
        return _json_error(str(exc))

    if screen_slug is not None:
        screen = get_screen_by_slug(board, screen_slug)
        if screen is None:
            return _json_error('Screen not found.', status=404)
        if screen['type'] != 'manual':
            return _json_error('Only manual screens support API screen updates.', status=400)

        screen['lines'] = trim_message_lines(normalized_lines)
        save_screens(request.app[SCREENS_PATH_KEY], request.app[BOARD_REGISTRY_KEY].boards)
        sync_board_display_messages(board, request.app[PLUGINS_KEY])
        await broadcast_display_config(request.app, board.config.slug)
        return web.json_response(
            {
                'boardSlug': board.config.slug,
                'screen': serialize_screen_for_admin(screen, board.config, request.app[PLUGINS_KEY]),
            }
        )

    board.message_state.set_override(normalized_lines)
    schedule_override_clear(request.app, board.config.slug)
    await broadcast_message_state(request.app, board.config.slug)
    return web.json_response(board.message_state.serialize())


async def delete_message(request: web.Request) -> web.Response:
    board = resolve_board_from_query(request, required=True)
    await clear_override(request.app, board.config.slug)
    return web.json_response(board.message_state.serialize())


async def admin_session_create(request: web.Request) -> web.Response:
    configured_password = request.app[ADMIN_PASSWORD_STATE_KEY].password
    try:
        payload = await request.json()
    except Exception:
        return _json_error('Request body must be valid JSON.')

    password = payload.get('password') if isinstance(payload, dict) else None
    if password != configured_password:
        return _json_error('Invalid password.', status=401)

    session_token = secrets.token_urlsafe(32)
    request.app[SESSION_TOKENS_KEY].add(session_token)

    response = web.json_response({'authenticated': True})
    response.set_cookie(
        'flipoff_admin_session',
        session_token,
        httponly=True,
        samesite='Lax',
        secure=request.secure,
        max_age=60 * 60 * 12,
        path='/',
    )
    return response


async def admin_session_delete(request: web.Request) -> web.Response:
    session_token = request.cookies.get('flipoff_admin_session')
    if session_token:
        request.app[SESSION_TOKENS_KEY].discard(session_token)

    response = web.json_response({'authenticated': False})
    response.del_cookie('flipoff_admin_session', path='/')
    return response


async def admin_boards_get(request: web.Request) -> web.Response:
    require_admin(request)
    return web.json_response(build_admin_boards_response(request.app[BOARD_REGISTRY_KEY]))


async def admin_boards_post(request: web.Request) -> web.Response:
    require_admin(request)

    try:
        payload = await request.json()
    except Exception:
        return _json_error('Request body must be valid JSON.')

    if not isinstance(payload, dict):
        return _json_error('Request body must be a JSON object.')

    registry = request.app[BOARD_REGISTRY_KEY]
    name = _coerce_optional_string(payload.get('name'), 'name') or 'New Board'
    requested_slug = payload.get('slug')
    if requested_slug is None:
        slug = _make_unique_slug(_suggest_slug(name, 'board'), set(registry.boards))
    else:
        try:
            slug = _coerce_slug(requested_slug, 'slug')
        except ValueError as exc:
            return _json_error(str(exc))
        if slug in registry.boards:
            return _json_error(f"Board slug '{slug}' already exists.")

    template = get_default_board(request.app).config
    config = DisplayConfig(
        slug=slug,
        name=name,
        cols=template.cols,
        rows=template.rows,
        default_messages=[],
        message_duration_seconds=template.message_duration_seconds,
        api_message_duration_seconds=template.api_message_duration_seconds,
    )
    board = build_default_board_state(config, plugins=request.app[PLUGINS_KEY])
    registry.boards[slug] = board

    save_board_settings(
        request.app[CONFIG_PATH_KEY],
        registry,
        admin_password=request.app[ADMIN_PASSWORD_STATE_KEY].password,
    )
    save_screens(request.app[SCREENS_PATH_KEY], registry.boards)
    restart_plugin_refresh_tasks(request.app, slug)
    return web.json_response(build_admin_boards_response(registry))


async def admin_board_delete(request: web.Request) -> web.Response:
    require_admin(request)

    try:
        board_slug = resolve_board_page_slug(request)
    except ValueError as exc:
        return _json_error(str(exc))

    registry = request.app[BOARD_REGISTRY_KEY]
    if board_slug not in registry.boards:
        return _json_error('Board not found.', status=404)
    if len(registry.boards) <= 1:
        return _json_error('At least one board is required.', status=400)

    board = registry.boards.pop(board_slug)
    cancel_override_task(board)
    cancel_plugin_refresh_tasks(board)

    if registry.default_board_slug == board_slug:
        registry.default_board_slug = next(iter(registry.boards))

    save_board_settings(
        request.app[CONFIG_PATH_KEY],
        registry,
        admin_password=request.app[ADMIN_PASSWORD_STATE_KEY].password,
    )
    save_screens(request.app[SCREENS_PATH_KEY], registry.boards)
    return web.json_response(build_admin_boards_response(registry))


async def admin_config_get(request: web.Request) -> web.Response:
    require_admin(request)
    board = resolve_board_from_query(request, required=True)
    sync_board_display_messages(board, request.app[PLUGINS_KEY])
    return web.json_response(
        build_admin_config_response(
            board,
            default_board_slug=request.app[BOARD_REGISTRY_KEY].default_board_slug,
            has_admin_password=bool(request.app[ADMIN_PASSWORD_STATE_KEY].password),
        )
    )


async def admin_config_put(request: web.Request) -> web.Response:
    require_admin(request)
    board = resolve_board_from_query(request, required=True)
    old_slug = board.config.slug

    try:
        payload = await request.json()
    except Exception:
        return _json_error('Request body must be valid JSON.')

    try:
        cols, rows, message_duration_seconds, api_message_duration_seconds = normalize_runtime_settings_payload(payload)
        next_name = _coerce_optional_string(payload.get('name'), 'name') or board.config.name
        next_slug = _coerce_slug(payload.get('slug', board.config.slug), 'slug')
        is_default = _coerce_bool(
            payload.get('isDefault', board.config.slug == request.app[BOARD_REGISTRY_KEY].default_board_slug),
            'isDefault',
        )
        submitted_admin_password = _coerce_optional_string(payload.get('adminPassword'), 'adminPassword')
    except ValueError as exc:
        return _json_error(str(exc))

    registry = request.app[BOARD_REGISTRY_KEY]
    if next_slug != old_slug and next_slug in registry.boards:
        return _json_error(f"Board slug '{next_slug}' already exists.")

    reconciled_screens = reconcile_screens_for_config_change(
        board.screens,
        cols=cols,
        rows=rows,
        plugins=request.app[PLUGINS_KEY],
    )

    board.config.slug = next_slug
    board.config.name = next_name
    board.config.cols = cols
    board.config.rows = rows
    board.config.message_duration_seconds = message_duration_seconds
    board.config.api_message_duration_seconds = api_message_duration_seconds
    board.screens = reconciled_screens
    board.message_state.clear(rows)

    if next_slug != old_slug:
        registry.boards[next_slug] = registry.boards.pop(old_slug)
        if registry.default_board_slug == old_slug:
            registry.default_board_slug = next_slug

    if is_default:
        registry.default_board_slug = next_slug

    if submitted_admin_password:
        request.app[ADMIN_PASSWORD_STATE_KEY].password = submitted_admin_password
        request.app[ADMIN_PASSWORD_STATE_KEY].generated = False

    save_board_settings(
        request.app[CONFIG_PATH_KEY],
        registry,
        admin_password=request.app[ADMIN_PASSWORD_STATE_KEY].password,
    )
    save_screens(request.app[SCREENS_PATH_KEY], registry.boards)

    await refresh_all_plugin_screens_for_board(request.app, next_slug, broadcast=False)
    restart_plugin_refresh_tasks(request.app, next_slug)
    await broadcast_display_config(request.app, next_slug)
    await broadcast_message_state(request.app, next_slug)

    return web.json_response(
        build_admin_config_response(
            board,
            default_board_slug=registry.default_board_slug,
            has_admin_password=bool(request.app[ADMIN_PASSWORD_STATE_KEY].password),
        )
    )


async def admin_screens_get(request: web.Request) -> web.Response:
    require_admin(request)
    board = resolve_board_from_query(request, required=True)
    return web.json_response(build_admin_screens_response(request.app, board))


async def admin_screens_put(request: web.Request) -> web.Response:
    require_admin(request)
    board = resolve_board_from_query(request, required=True)

    try:
        payload = await request.json()
    except Exception:
        return _json_error('Request body must be valid JSON.')

    existing_screens = {screen['id']: screen for screen in board.screens}

    try:
        normalized_screens = normalize_screens_payload(
            payload,
            config=board.config,
            plugins=request.app[PLUGINS_KEY],
            existing_screens=existing_screens,
        )
        common_settings = normalize_plugin_common_settings(
            payload.get('pluginCommonSettings'),
            plugins=request.app[PLUGINS_KEY],
        )
    except ValueError as exc:
        return _json_error(str(exc))

    board.screens = normalized_screens
    request.app[BOARD_REGISTRY_KEY].common_settings = common_settings

    save_screens(request.app[SCREENS_PATH_KEY], request.app[BOARD_REGISTRY_KEY].boards)
    save_board_settings(
        request.app[CONFIG_PATH_KEY],
        request.app[BOARD_REGISTRY_KEY],
        admin_password=request.app[ADMIN_PASSWORD_STATE_KEY].password,
    )

    await refresh_all_plugin_screens_for_board(request.app, board.config.slug, broadcast=False)
    restart_plugin_refresh_tasks(request.app, board.config.slug)
    await broadcast_display_config(request.app, board.config.slug)

    return web.json_response(build_admin_screens_response(request.app, board))


async def admin_screen_refresh(request: web.Request) -> web.Response:
    require_admin(request)
    board = resolve_board_from_query(request, required=True)

    screen_id = request.match_info['screen_id']
    screen = get_screen_by_id(board, screen_id)
    if screen is None:
        return _json_error('Screen not found.', status=404)
    if screen['type'] != 'plugin':
        return _json_error('Only plugin screens support manual refresh.', status=400)

    await refresh_plugin_screen(request.app, board.config.slug, screen_id, broadcast=True)
    refreshed_screen = get_screen_by_id(board, screen_id)
    return web.json_response(
        {
            'screen': serialize_screen_for_admin(
                refreshed_screen,
                board.config,
                request.app[PLUGINS_KEY],
            )
        }
    )


async def websocket_handler(request: web.Request) -> web.StreamResponse:
    board = resolve_board_from_query(request, required=True)
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)

    request.app[WS_CLIENTS_KEY].setdefault(board.config.slug, set()).add(ws)
    sync_board_display_messages(board, request.app[PLUGINS_KEY])
    await ws.send_json(build_config_event(board.config))
    await ws.send_json(build_message_event(board.message_state))

    try:
        async for _ in ws:
            continue
    finally:
        request.app[WS_CLIENTS_KEY].setdefault(board.config.slug, set()).discard(ws)

    return ws


async def screenshot_handler(_: web.Request) -> web.Response:
    return web.FileResponse(PROJECT_ROOT / 'screenshot.png')


async def favicon_handler(_: web.Request) -> web.Response:
    return web.Response(status=204)


@web.middleware
async def no_cache_static_assets(request: web.Request, handler) -> web.StreamResponse:
    response = await handler(request)
    if request.method == 'GET' and (
        request.path in {'/', '/index.html', '/admin', '/admin/', '/screenshot.png', '/favicon.ico'}
        or request.path.startswith('/js/')
        or request.path.startswith('/css/')
        or (request.path.count('/') == 1 and request.path not in {'/', '/admin'})
    ):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


async def initialize_plugin_runtime(app: web.Application) -> None:
    app[PLUGIN_HTTP_SESSION_KEY] = ClientSession(timeout=ClientTimeout(total=20))
    for board_slug in list(app[BOARD_REGISTRY_KEY].boards):
        await refresh_all_plugin_screens_for_board(app, board_slug, broadcast=False)
        restart_plugin_refresh_tasks(app, board_slug)


async def cleanup_background_tasks(app: web.Application) -> None:
    for board in app[BOARD_REGISTRY_KEY].boards.values():
        override_task = board.override_task
        cancel_override_task(board)
        if override_task is not None:
            with suppress(asyncio.CancelledError):
                await override_task


async def cleanup_plugin_runtime(app: web.Application) -> None:
    for board in app[BOARD_REGISTRY_KEY].boards.values():
        cancel_plugin_refresh_tasks(board)
        for task in list(board.refresh_tasks.values()):
            with suppress(asyncio.CancelledError):
                await task

    session = app.get(PLUGIN_HTTP_SESSION_KEY)
    if session is not None:
        await session.close()


async def close_websockets(app: web.Application) -> None:
    websocket_close_tasks = [
        ws.close(code=1001, message=b'server shutdown')
        for clients in app[WS_CLIENTS_KEY].values()
        for ws in set(clients)
        if not ws.closed
    ]
    if websocket_close_tasks:
        await asyncio.gather(*websocket_close_tasks, return_exceptions=True)
    app[WS_CLIENTS_KEY].clear()


def resolve_admin_password(admin_password: str | None, config_path: Path | None) -> tuple[str, bool]:
    if admin_password:
        return admin_password, False

    config_password = load_admin_password(config_path)
    if config_password:
        return config_password, False

    return secrets.token_urlsafe(16), True


async def announce_admin_password(app: web.Application) -> None:
    admin_password_state = app[ADMIN_PASSWORD_STATE_KEY]
    if admin_password_state.generated:
        print(f'[flipoff] Generated admin password: {admin_password_state.password}', flush=True)


def create_app(
    *,
    admin_password: str | None = None,
    config_path: Path | None = CONFIG_PATH,
    screens_path: Path | None = SCREENS_PATH,
    plugins: dict[str, ScreenPlugin] | None = None,
) -> web.Application:
    plugin_registry = plugins or load_plugins()
    board_configs, default_board_slug = load_board_configs(config_path)
    screens_by_board = load_screens_payload(screens_path)
    common_settings = load_plugin_common_settings(config_path, plugins=plugin_registry)
    registry = build_registry(
        board_configs=board_configs,
        default_board_slug=default_board_slug,
        common_settings=common_settings,
        screens_by_board=screens_by_board,
        plugins=plugin_registry,
    )
    resolved_admin_password, generated_admin_password = resolve_admin_password(admin_password, config_path)

    app = web.Application(middlewares=[no_cache_static_assets])
    app[BOARD_REGISTRY_KEY] = registry
    app[WS_CLIENTS_KEY] = {}
    app[ADMIN_PASSWORD_STATE_KEY] = AdminPasswordState(
        password=resolved_admin_password,
        generated=generated_admin_password,
    )
    app[SESSION_TOKENS_KEY] = set()
    app[CONFIG_PATH_KEY] = config_path
    app[SCREENS_PATH_KEY] = screens_path
    app[PLUGINS_KEY] = plugin_registry
    sync_legacy_default_app_keys(app)

    save_board_settings(
        config_path,
        registry,
        admin_password=resolved_admin_password,
    )
    save_screens(screens_path, registry.boards)

    app.on_startup.append(announce_admin_password)
    app.on_startup.append(initialize_plugin_runtime)
    app.on_shutdown.append(close_websockets)
    app.on_cleanup.append(cleanup_background_tasks)
    app.on_cleanup.append(cleanup_plugin_runtime)

    app.router.add_get('/', index_handler)
    app.router.add_get('/index.html', index_handler)
    app.router.add_get('/admin', admin_handler)
    app.router.add_get('/admin/', admin_handler)
    app.router.add_get('/api/config', get_display_config)
    app.router.add_get('/api/message', get_message)
    app.router.add_post('/api/message', post_message)
    app.router.add_delete('/api/message', delete_message)
    app.router.add_post('/api/admin/session', admin_session_create)
    app.router.add_delete('/api/admin/session', admin_session_delete)
    app.router.add_get('/api/admin/boards', admin_boards_get)
    app.router.add_post('/api/admin/boards', admin_boards_post)
    app.router.add_delete('/api/admin/boards/{board_slug}', admin_board_delete)
    app.router.add_get('/api/admin/config', admin_config_get)
    app.router.add_put('/api/admin/config', admin_config_put)
    app.router.add_get('/api/admin/screens', admin_screens_get)
    app.router.add_put('/api/admin/screens', admin_screens_put)
    app.router.add_post('/api/admin/screens/{screen_id}/refresh', admin_screen_refresh)
    app.router.add_get('/ws', websocket_handler)
    app.router.add_static('/css', PROJECT_ROOT / 'css')
    app.router.add_static('/js', PROJECT_ROOT / 'js')
    app.router.add_get('/screenshot.png', screenshot_handler)
    app.router.add_get('/favicon.ico', favicon_handler)
    app.router.add_get('/{board_slug}', board_handler)
    app.router.add_get('/{board_slug}/', board_handler)

    return app


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8080'))
    web.run_app(create_app(), host='0.0.0.0', port=port)
