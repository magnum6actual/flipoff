import unittest

from plugins.api_ninjas.quote_of_the_day import QuoteOfTheDayPlugin
from plugins.api_ninjas.random_quote import RandomQuotePlugin
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
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def get(self, url, *, params=None, headers=None):
        self.calls.append({'url': url, 'params': params, 'headers': headers})
        return FakeResponse(self.payload)


class ApiNinjasQuoteTests(unittest.IsolatedAsyncioTestCase):
    async def test_random_quote_wraps_quote_text_across_multiple_lines(self):
        plugin = RandomQuotePlugin()
        session = FakeSession(
            [
                {
                    'quote': 'Never let the fear of striking out keep you from playing the game',
                    'author': 'Babe Ruth',
                }
            ]
        )

        result = await plugin.refresh(
            settings={},
            design={'title': ''},
            context=PluginContext(cols=18, rows=5),
            http_session=session,
            common_settings={'apiNinjasApiKey': 'secret'},
        )

        self.assertEqual(
            result.lines,
            [
                'NEVER LET THE FEAR',
                'OF STRIKING OUT',
                'KEEP YOU FROM',
                'PLAYING THE GAME',
                '- BABE RUTH',
            ],
        )

    async def test_quote_of_day_wraps_and_reserves_space_for_author_when_title_exists(self):
        plugin = QuoteOfTheDayPlugin()
        session = FakeSession(
            [
                {
                    'quote': 'Never let the fear of striking out keep you from playing the game',
                    'author': 'Babe Ruth',
                }
            ]
        )

        result = await plugin.refresh(
            settings={},
            design={'title': 'QUOTE'},
            context=PluginContext(cols=18, rows=5),
            http_session=session,
            common_settings={'apiNinjasApiKey': 'secret'},
        )

        self.assertEqual(
            result.lines,
            [
                'QUOTE',
                '',
                'NEVER LET THE FEAR',
                'OF STRIKING OUT',
                '- BABE RUTH',
            ],
        )


if __name__ == '__main__':
    unittest.main()
