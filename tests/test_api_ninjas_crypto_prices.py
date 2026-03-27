import unittest

from plugins.api_ninjas.crypto_prices import CryptoPricesPlugin
from plugins.base import PluginContext


class FakeResponse:
    def __init__(self, payload, ok=True):
        self._payload = payload
        self.ok = ok

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def json(self, content_type=None):
        return self._payload


class FakeSession:
    def __init__(self, payloads):
        self.payloads = payloads
        self.calls = []

    def get(self, url, *, params=None, headers=None):
        symbol = params['symbol']
        self.calls.append({'url': url, 'symbol': symbol, 'headers': headers})
        return FakeResponse(self.payloads[symbol])


class ApiNinjasCryptoPricesTests(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_normalizes_plain_symbols_to_usd_pairs_without_default_title(self):
        plugin = CryptoPricesPlugin()
        session = FakeSession(
            {
                'BTCUSD': {'price': '69217.76000000'},
                'ETHUSD': {'price': '2077.42000000'},
                'SOLUSDT': {'price': '86.65000000'},
            }
        )

        result = await plugin.refresh(
            settings={'symbol1': 'btc', 'symbol2': 'eth', 'symbol3': 'SOLUSDT'},
            design={'title': ''},
            context=PluginContext(cols=18, rows=5),
            http_session=session,
            common_settings={'apiNinjasApiKey': 'secret'},
        )

        self.assertEqual(
            [call['symbol'] for call in session.calls],
            ['BTCUSD', 'ETHUSD', 'SOLUSDT'],
        )
        self.assertEqual(
            result.lines,
            ['BTC      69217.76', 'ETH       2077.42', 'SOLUSDT     86.65'],
        )

    def test_placeholder_uses_three_symbols(self):
        plugin = CryptoPricesPlugin()
        lines = plugin.placeholder_lines(
            settings={'symbol1': 'btc', 'symbol2': 'eth', 'symbol3': 'sol'},
            design={'title': ''},
            context=PluginContext(cols=18, rows=5),
            error=None,
        )
        self.assertEqual(lines, ['BTC  --', 'ETH  --', 'SOL  --'])

    def test_placeholder_includes_title_when_override_is_set(self):
        plugin = CryptoPricesPlugin()
        lines = plugin.placeholder_lines(
            settings={'symbol1': 'btc', 'symbol2': 'eth', 'symbol3': 'sol'},
            design={'title': 'CRYPTO'},
            context=PluginContext(cols=18, rows=5),
            error=None,
        )
        self.assertEqual(lines, ['CRYPTO', '', 'BTC  --', 'ETH  --', 'SOL  --'])

    async def test_refresh_aligns_price_column_for_mixed_symbol_lengths(self):
        plugin = CryptoPricesPlugin()
        session = FakeSession(
            {
                'BTCUSD': {'price': '69217.76000000'},
                'ETHUSD': {'price': '2.00000000'},
                'SOLUSDT': {'price': '86.65000000'},
            }
        )

        result = await plugin.refresh(
            settings={'symbol1': 'btc', 'symbol2': 'eth', 'symbol3': 'SOLUSDT'},
            design={'title': ''},
            context=PluginContext(cols=18, rows=5),
            http_session=session,
            common_settings={'apiNinjasApiKey': 'secret'},
        )

        self.assertEqual(
            result.lines,
            ['BTC      69217.76', 'ETH             2', 'SOLUSDT     86.65'],
        )


if __name__ == '__main__':
    unittest.main()
