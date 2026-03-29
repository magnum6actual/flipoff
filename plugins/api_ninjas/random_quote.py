from __future__ import annotations

import os

from ..base import PluginContext, PluginField, PluginManifest, PluginRefreshResult, ScreenPlugin
from .lib.common import (
    API_NINJAS_COMMON_SETTINGS_NAMESPACE,
    API_NINJAS_COMMON_SETTINGS_SCHEMA,
    API_NINJAS_QUOTES_URL,
    build_quote_lines,
    build_headers,
    fit,
    resolve_api_key,
)


class RandomQuotePlugin(ScreenPlugin):
    manifest = PluginManifest(
        plugin_id='api_ninjas_random_quote',
        name='Random Quote',
        description='Show a random quote from API Ninjas.',
        default_refresh_interval_seconds=3600,
        common_settings_namespace=API_NINJAS_COMMON_SETTINGS_NAMESPACE,
        common_settings_schema=API_NINJAS_COMMON_SETTINGS_SCHEMA,
        settings_schema=(),
        design_schema=(
            PluginField(
                name='title',
                label='Title Override',
                field_type='text',
                default='',
                placeholder='RANDOM QUOTE',
            ),
        ),
    )

    async def refresh(self, *, settings, design, context: PluginContext, http_session, previous_state=None, common_settings=None):
        api_key = resolve_api_key(common_settings, os.environ)

        async with http_session.get(
            API_NINJAS_QUOTES_URL,
            headers=build_headers(api_key),
        ) as response:
            payload = await response.json(content_type=None)
            if not response.ok:
                error = payload.get('error') if isinstance(payload, dict) else None
                raise ValueError(error or 'API Ninjas quote request failed.')

        if not isinstance(payload, list) or len(payload) == 0:
            raise ValueError('API Ninjas did not return a quote.')

        quote = payload[0]
        title_line = self.get_title_line(design=design, context=context)
        quote_lines = build_quote_lines(
            quote_text=quote.get('quote'),
            author=quote.get('author'),
            cols=context.cols,
            rows=context.rows,
            has_title=bool(title_line),
        )
        lines = self.with_optional_title(
            quote_lines,
            design=design,
            context=context,
        )[: context.rows]

        return PluginRefreshResult(
            lines=lines,
            meta={},
        )

    def placeholder_lines(self, *, settings, design, context: PluginContext, error=None):
        detail = (error or 'FETCHING').upper()
        return self.with_optional_title([
            fit(detail, context.cols),
            fit('QUOTE PENDING', context.cols),
        ], design=design, context=context)[: context.rows]


PLUGIN = RandomQuotePlugin()
