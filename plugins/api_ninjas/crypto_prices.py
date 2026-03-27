from __future__ import annotations

import asyncio
import os
from decimal import Decimal, InvalidOperation

from ..base import PluginContext, PluginField, PluginManifest, PluginRefreshResult, ScreenPlugin
from .lib.common import (
    API_NINJAS_COMMON_SETTINGS_NAMESPACE,
    API_NINJAS_COMMON_SETTINGS_SCHEMA,
    API_NINJAS_CRYPTO_PRICE_URL,
    build_headers,
    fit,
    format_aligned_pairs,
    resolve_api_key,
)

DEFAULT_SYMBOLS = ('BTC', 'ETH', 'SOL')
KNOWN_QUOTE_SUFFIXES = ('USDT', 'USDC', 'USD', 'BTC', 'ETH', 'EUR', 'GBP')


class CryptoPricesPlugin(ScreenPlugin):
    manifest = PluginManifest(
        plugin_id='api_ninjas_crypto_prices',
        name='Crypto Prices',
        description='Show live prices for three cryptocurrencies from API Ninjas.',
        default_refresh_interval_seconds=300,
        common_settings_namespace=API_NINJAS_COMMON_SETTINGS_NAMESPACE,
        common_settings_schema=API_NINJAS_COMMON_SETTINGS_SCHEMA,
        settings_schema=(
            PluginField(
                name='symbol1',
                label='Symbol 1',
                field_type='text',
                default=DEFAULT_SYMBOLS[0],
                placeholder='BTC',
                required=True,
                help_text='Enter a ticker like BTC or ETH. Plain tickers are requested as USD pairs.',
            ),
            PluginField(
                name='symbol2',
                label='Symbol 2',
                field_type='text',
                default=DEFAULT_SYMBOLS[1],
                placeholder='ETH',
                required=True,
                help_text='Enter a ticker like BTC or ETH. Plain tickers are requested as USD pairs.',
            ),
            PluginField(
                name='symbol3',
                label='Symbol 3',
                field_type='text',
                default=DEFAULT_SYMBOLS[2],
                placeholder='SOL',
                required=True,
                help_text='Enter a ticker like BTC or ETH. Plain tickers are requested as USD pairs.',
            ),
        ),
        design_schema=(
            PluginField(
                name='title',
                label='Title Override',
                field_type='text',
                default='',
                placeholder='CRYPTO PRICES',
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
        api_key = resolve_api_key(common_settings, os.environ)
        symbols = self._resolve_symbols(settings)
        prices = await asyncio.gather(
            *[
                self._fetch_price(http_session, api_key, request_symbol)
                for _, request_symbol in symbols
            ]
        )

        lines = format_aligned_pairs(
            [
                (display_symbol, self._format_price(payload.get('price')))
                for (display_symbol, _), payload in zip(symbols, prices)
            ],
            context.cols,
        )
        lines = self.with_optional_title(lines, design=design, context=context)

        return PluginRefreshResult(
            lines=lines[: context.rows],
            meta={
                'symbols': [display_symbol for display_symbol, _ in symbols],
            },
        )

    def placeholder_lines(self, *, settings, design, context: PluginContext, error=None):
        symbols = [display_symbol for display_symbol, _ in self._resolve_symbols(settings)]
        lines = format_aligned_pairs(
            [(symbol, '--') for symbol in symbols],
            context.cols,
        )
        if error and context.rows > len(lines):
            lines.append(fit(str(error).upper(), context.cols))
        return self.with_optional_title(lines, design=design, context=context)[: context.rows]

    async def _fetch_price(self, http_session, api_key: str, symbol: str) -> dict:
        async with http_session.get(
            API_NINJAS_CRYPTO_PRICE_URL,
            params={'symbol': symbol},
            headers=build_headers(api_key),
        ) as response:
            payload = await response.json(content_type=None)
            if not response.ok:
                error = payload.get('error') if isinstance(payload, dict) else None
                raise ValueError(error or f'API Ninjas crypto price request failed for {symbol}.')
        if not isinstance(payload, dict):
            raise ValueError(f'API Ninjas returned an invalid price payload for {symbol}.')
        return payload

    def _resolve_symbols(self, settings) -> list[tuple[str, str]]:
        resolved: list[tuple[str, str]] = []
        for index, default_symbol in enumerate(DEFAULT_SYMBOLS, start=1):
            raw_value = str(settings.get(f'symbol{index}') or default_symbol).strip().upper()
            display_symbol = self._sanitize_symbol(raw_value or default_symbol)
            if self._has_quote_suffix(display_symbol):
                request_symbol = display_symbol
            else:
                request_symbol = f'{display_symbol}USD'
            resolved.append((display_symbol, request_symbol))
        return resolved

    def _sanitize_symbol(self, value: str) -> str:
        cleaned = ''.join(character for character in value if character.isalnum())
        return cleaned or 'BTC'

    def _has_quote_suffix(self, value: str) -> bool:
        return any(value.endswith(suffix) and len(value) > len(suffix) for suffix in KNOWN_QUOTE_SUFFIXES)

    def _format_price(self, value) -> str:
        try:
            amount = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return '--'

        absolute_amount = abs(amount)
        if absolute_amount >= Decimal('1000'):
            return f'{amount:.2f}'
        if absolute_amount >= Decimal('1'):
            return f'{amount:.4f}'.rstrip('0').rstrip('.')
        return f'{amount:.6f}'.rstrip('0').rstrip('.')


PLUGIN = CryptoPricesPlugin()
