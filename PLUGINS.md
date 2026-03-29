# Plugin Development Guide

This document describes how plugins work in FlipOff and how to build new ones that integrate cleanly with the admin UI, runtime refresh loop, and persisted screen system.

## Overview

Plugins are server-side screen generators.

A plugin:
- declares a manifest that tells the admin UI how to configure it
- fetches or computes data on the server
- renders output as a list of display lines
- can refresh on demand or on a schedule
- can persist plugin-specific runtime state between refreshes
- can optionally share settings with other plugins in the same family

Plugins are discovered automatically from the `plugins/` package.

## Where Plugins Live

Plugins can be placed anywhere under `plugins/` as long as they are valid Python modules.

Current examples:
- `plugins/weather/open_meteo_forecast.py`
- `plugins/github/repo_stats.py`
- `plugins/github/open_work.py`
- `plugins/api_ninjas/random_quote.py`
- `plugins/api_ninjas/quote_of_the_day.py`
- `plugins/api_ninjas/crypto_prices.py`

You can also create plugin families with shared helpers:
- `plugins/github/lib/common.py`
- `plugins/api_ninjas/lib/common.py`

This structure is encouraged. It lets multiple plugins share common API clients, formatting logic, or validation helpers without pushing everything into the top level.

## Discovery Rules

Plugin discovery is implemented in [plugins/__init__.py](/Users/vultuk/Development/Personal/flipoff/plugins/__init__.py).

The loader:
- recursively scans `plugins/**/*.py`
- ignores files named `__init__.py`
- ignores `plugins/base.py`
- imports each remaining module
- registers the module-level `PLUGIN` object if present

To be loadable, a module must expose:

```python
PLUGIN = MyPlugin()
```

If a module has no `PLUGIN` symbol, it is ignored.

## Runtime Storage

FlipOff keeps runtime data outside the repository:

- `~/.flipoff/config.json`
  - board settings
  - shared plugin settings
- `~/.flipoff/screens.json`
  - manual screens
  - plugin screens
  - cached plugin output
  - plugin state
  - last refresh metadata

This means plugin configuration is user-local, not checked into the repo.

## The Plugin Base API

All plugins are built on [plugins/base.py](/Users/vultuk/Development/Personal/flipoff/plugins/base.py).

Core types:
- `PluginManifest`
- `PluginField`
- `PluginFieldOption`
- `PluginContext`
- `PluginRefreshResult`
- `ScreenPlugin`

### `PluginManifest`

Every plugin must provide a manifest.

Required fields:
- `plugin_id: str`
- `name: str`
- `description: str`
- `default_refresh_interval_seconds: int`

Optional fields:
- `settings_schema: tuple[PluginField, ...] = ()`
- `design_schema: tuple[PluginField, ...] = ()`
- `common_settings_namespace: str = ''`
- `common_settings_schema: tuple[PluginField, ...] = ()`

Important rules:
- `plugin_id` must be stable once a plugin is in use, because saved screens reference it.
- `plugin_id` should be unique across the whole plugin registry.
- `name` and `description` are shown in the admin UI.
- `default_refresh_interval_seconds` is used when a new plugin screen is created.

### `PluginField`

`PluginField` describes a single admin form field.

Supported field types:
- `text`
- `select`
- `checkbox`
- `number`

Field properties:
- `name`
- `label`
- `field_type`
- `required`
- `default`
- `placeholder`
- `help_text`
- `options`

`options` is only used for `select` and is made of `PluginFieldOption(label, value)`.

### `PluginContext`

`PluginContext` contains the live display dimensions:
- `cols`
- `rows`

Use it when formatting output so your plugin respects the actual board size.

### `PluginRefreshResult`

`refresh()` must return:

```python
PluginRefreshResult(
    lines=[...],
    meta={...},
)
```

`lines`:
- are the rendered lines for the screen
- are validated by the server against the current board size

`meta`:
- is optional
- is persisted into the screen as `pluginState`
- is passed back into the next refresh as `previous_state`

Use `meta` for lightweight persisted runtime state such as:
- last successful payload data
- cache keys
- a quote-of-the-day date stamp
- a selected item that should remain stable until the next day or refresh window

## The `ScreenPlugin` Contract

Plugins subclass `ScreenPlugin` and implement:

```python
async def refresh(
    self,
    *,
    settings: dict[str, Any],
    design: dict[str, Any],
    context: PluginContext,
    http_session: ClientSession,
    previous_state: dict[str, Any] | None = None,
    common_settings: dict[str, Any] | None = None,
) -> PluginRefreshResult:
    ...
```

Arguments:
- `settings`
  - the per-screen settings from `settings_schema`
- `design`
  - the per-screen design values from `design_schema`
- `context`
  - current board dimensions
- `http_session`
  - a shared `aiohttp.ClientSession` created by the server
- `previous_state`
  - the previously persisted `meta` value for this screen
- `common_settings`
  - shared settings for a plugin family, if configured

Plugins may also override:

```python
def placeholder_lines(
    self,
    *,
    settings: dict[str, Any],
    design: dict[str, Any],
    context: PluginContext,
    error: str | None = None,
) -> list[str]:
    ...
```

This is used before the first successful refresh, or when cached output is absent.

## Title Behavior

The base class provides two helpers:
- `get_title_line(...)`
- `with_optional_title(...)`

Current system behavior:
- if `design["title"]` is blank, no title line is rendered
- if `design["title"]` is present, the plugin output becomes:
  1. title line
  2. blank spacer line
  3. content lines

If your plugin offers a `Title Override`, it should usually call `with_optional_title(...)` instead of manually prepending the title.

## Line Formatting Rules

Plugin output is validated by the server before it is used.

That means:
- each line must be a string
- each line must fit inside `context.cols`
- total line count must fit inside `context.rows`

Best practice:
- always format against `context.cols` and `context.rows`
- do not assume the default board size is always `18x5`
- trim, wrap, or abbreviate content yourself before returning it

The server will reject invalid output if it exceeds the display size.

## Shared Plugin Settings

Some plugins need a setting that should be reused across several related plugins.

Example:
- the API Ninjas plugins share one API key

This is handled with:
- `common_settings_namespace`
- `common_settings_schema`

How it works:
- all plugins with the same namespace share the same stored values
- those values are edited from the plugin modal
- they are persisted in `~/.flipoff/config.json` under `pluginCommonSettings`
- they are passed into `refresh()` as `common_settings`

Example from the API Ninjas plugins:

```python
manifest = PluginManifest(
    plugin_id='api_ninjas_random_quote',
    name='Random Quote',
    description='Show a random quote from API Ninjas.',
    default_refresh_interval_seconds=3600,
    common_settings_namespace='quotes',
    common_settings_schema=(
        PluginField(
            name='apiNinjasApiKey',
            label='API Ninjas API Key',
            field_type='text',
            default='',
        ),
    ),
)
```

Use shared settings when:
- multiple plugins talk to the same external service
- a token should only be entered once per user
- the value is not specific to one individual screen instance

Do not use shared settings for values that differ screen by screen.

## Per-Screen Settings vs Design

Keep a clean split:

Use `settings_schema` for:
- repository names
- city/country
- ticker symbols
- API parameters
- screen-specific behavior

Use `design_schema` for:
- `title`
- visual toggles such as `showConditions`
- other display-only presentation choices

This distinction matters because the admin UI treats them as separate sections and the server validates them independently.

## Screen Persistence Model

Plugin-backed screens are saved in `~/.flipoff/screens.json` with fields like:

```json
{
  "id": "abc123",
  "type": "plugin",
  "name": "",
  "enabled": true,
  "pluginId": "github_repo_stats",
  "refreshIntervalSeconds": 300,
  "settings": {
    "repository": "magnum6actual/flipoff"
  },
  "design": {
    "title": ""
  },
  "pluginState": {},
  "cachedLines": [],
  "lastRefreshedAt": null,
  "lastError": null
}
```

Meaning:
- `settings`
  - validated from your `settings_schema`
- `design`
  - validated from your `design_schema`
- `pluginState`
  - your last `PluginRefreshResult.meta`
- `cachedLines`
  - your last successful rendered output
- `lastRefreshedAt`
  - timestamp of last successful refresh
- `lastError`
  - last refresh error string, if any

## Refresh Lifecycle

Plugin screens refresh in three ways:

1. On server startup
- the server creates a shared HTTP session
- all enabled plugin screens are refreshed

2. On schedule
- each enabled plugin screen runs a background loop based on `refreshIntervalSeconds`

3. Manually from admin
- the admin UI can call a refresh endpoint for a single plugin screen

The relevant admin endpoint is:
- `POST /api/admin/screens/{screen_id}/refresh`

## Error Handling

If a refresh raises an exception:
- `lastError` is updated on the screen
- the previous cached lines remain in place unless there were none
- placeholder content may be shown if no cached lines exist

Write errors for operators, not for developers only.

Good:
- `Open-Meteo could not find that city/country combination.`
- `API_NINJAS_API_KEY is not configured on the server.`

Bad:
- generic tracebacks
- unclear one-word errors

## Recommended Authoring Pattern

Use this structure:

1. Put family-wide helpers in `plugins/<family>/lib/common.py`
2. Put one plugin per file
3. Expose one `PLUGIN = ...` object per plugin module
4. Keep manifest declarations near the top of the file
5. Keep request/formatting helpers as private methods
6. Return only screen-sized, board-ready lines

## Minimal Example

```python
from __future__ import annotations

from ..base import PluginContext, PluginField, PluginManifest, PluginRefreshResult, ScreenPlugin


class HelloPlugin(ScreenPlugin):
    manifest = PluginManifest(
        plugin_id='hello_plugin',
        name='Hello Plugin',
        description='Example plugin for development.',
        default_refresh_interval_seconds=300,
        settings_schema=(
            PluginField(
                name='message',
                label='Message',
                field_type='text',
                default='HELLO WORLD',
                required=True,
            ),
        ),
        design_schema=(
            PluginField(
                name='title',
                label='Title Override',
                field_type='text',
                default='',
            ),
        ),
    )

    async def refresh(
        self,
        *,
        settings,
        design,
        context: PluginContext,
        http_session,
        previous_state=None,
        common_settings=None,
    ) -> PluginRefreshResult:
        message = str(settings.get('message') or 'HELLO WORLD').strip().upper()
        lines = self.with_optional_title(
            [message[: context.cols]],
            design=design,
            context=context,
        )
        return PluginRefreshResult(lines=lines[: context.rows])


PLUGIN = HelloPlugin()
```

## Example With Shared Settings

```python
from __future__ import annotations

import os

from ..base import PluginField, PluginManifest, PluginRefreshResult, ScreenPlugin


class ExampleApiPlugin(ScreenPlugin):
    manifest = PluginManifest(
        plugin_id='example_api_plugin',
        name='Example API Plugin',
        description='Uses a shared API key.',
        default_refresh_interval_seconds=300,
        common_settings_namespace='example_service',
        common_settings_schema=(
            PluginField(
                name='apiKey',
                label='API Key',
                field_type='text',
                default='',
            ),
        ),
    )

    async def refresh(self, *, settings, design, context, http_session, previous_state=None, common_settings=None):
        api_key = (common_settings or {}).get('apiKey') or os.environ.get('EXAMPLE_API_KEY')
        if not api_key:
            raise ValueError('No API key configured.')
        return PluginRefreshResult(lines=['READY'])


PLUGIN = ExampleApiPlugin()
```

## Validation and Testing

At minimum, test:
- plugin discovery works
- the plugin compiles
- the plugin renders valid output for the current board size
- the plugin handles missing config cleanly
- the plugin handles API failure cleanly
- any symbol or parameter normalization logic
- placeholder behavior

Useful commands:

```bash
python3 -m py_compile plugins/<family>/<plugin>.py
python3 -m unittest discover -s tests -v
```

If your plugin adds parsing or formatting logic, add targeted unit tests under `tests/`.

Existing examples:
- [tests/test_server.py](/Users/vultuk/Development/Personal/flipoff/tests/test_server.py)
- [tests/test_api_ninjas_crypto_prices.py](/Users/vultuk/Development/Personal/flipoff/tests/test_api_ninjas_crypto_prices.py)
- [tests/test_api_ninjas_quotes.py](/Users/vultuk/Development/Personal/flipoff/tests/test_api_ninjas_quotes.py)

## Practical Guidelines

- Keep `plugin_id` stable once published.
- Keep output concise and deterministic.
- Respect `context.cols` and `context.rows`.
- Prefer shared helper modules for external API families.
- Use `previous_state` only for small, screen-specific state.
- Use `common_settings` only for values shared across multiple plugins.
- Make refresh errors readable in the admin UI.
- Avoid extra dependencies if `aiohttp` and the standard library are enough.
- Do not rely on frontend code for plugin rendering. Plugins render on the server.

## Current Built-In Plugin Families

Weather:
- `plugins/weather/open_meteo_forecast.py`

GitHub:
- `plugins/github/repo_stats.py`
- `plugins/github/open_work.py`

API Ninjas:
- `plugins/api_ninjas/random_quote.py`
- `plugins/api_ninjas/quote_of_the_day.py`
- `plugins/api_ninjas/crypto_prices.py`

These are the best references when creating a new plugin.
