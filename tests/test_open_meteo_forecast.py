import unittest

from plugins.base import PluginContext
from plugins.weather.open_meteo_forecast import (
    OPEN_METEO_FORECAST_URL,
    OPEN_METEO_GEOCODING_URL,
    OpenMeteoForecastPlugin,
)


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

    def get(self, url, *, params=None):
        self.calls.append({'url': url, 'params': params})
        return FakeResponse(self.payloads[url])


class OpenMeteoForecastTests(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_aligns_temperature_column_without_conditions(self):
        plugin = OpenMeteoForecastPlugin()
        session = FakeSession(
            {
                OPEN_METEO_GEOCODING_URL: {
                    'results': [
                        {
                            'name': 'London',
                            'country_code': 'GB',
                            'latitude': 51.5072,
                            'longitude': -0.1276,
                            'timezone': 'Europe/London',
                        }
                    ]
                },
                OPEN_METEO_FORECAST_URL: {
                    'daily': {
                        'time': ['2026-03-26', '2026-03-27', '2026-03-28'],
                        'temperature_2m_max': [14, 9, 22],
                        'temperature_2m_min': [5, -1, 13],
                        'weather_code': [0, 63, 3],
                    }
                },
            }
        )

        result = await plugin.refresh(
            settings={'city': 'London', 'country': 'GB', 'units': 'M'},
            design={'title': '', 'showConditions': False},
            context=PluginContext(cols=18, rows=5),
            http_session=session,
        )

        self.assertEqual(
            [call['url'] for call in session.calls],
            [OPEN_METEO_GEOCODING_URL, OPEN_METEO_FORECAST_URL],
        )
        self.assertEqual(
            result.lines,
            ['THU   5/14C', 'FRI   -1/9C', 'SAT  13/22C'],
        )

    async def test_refresh_aligns_temperature_and_condition_columns(self):
        plugin = OpenMeteoForecastPlugin()
        session = FakeSession(
            {
                OPEN_METEO_GEOCODING_URL: {
                    'results': [
                        {
                            'name': 'London',
                            'country_code': 'GB',
                            'latitude': 51.5072,
                            'longitude': -0.1276,
                            'timezone': 'Europe/London',
                        }
                    ]
                },
                OPEN_METEO_FORECAST_URL: {
                    'daily': {
                        'time': ['2026-03-26', '2026-03-27', '2026-03-28'],
                        'temperature_2m_max': [14, 9, 22],
                        'temperature_2m_min': [5, -1, 13],
                        'weather_code': [0, 63, 95],
                    }
                },
            }
        )

        result = await plugin.refresh(
            settings={'city': 'London', 'country': 'GB', 'units': 'M'},
            design={'title': '', 'showConditions': True},
            context=PluginContext(cols=18, rows=5),
            http_session=session,
        )

        self.assertEqual(
            result.lines,
            ['THU   5/14C  CLEAR', 'FRI   -1/9C   RAIN', 'SAT  13/22C  TSTOR'],
        )


if __name__ == '__main__':
    unittest.main()
