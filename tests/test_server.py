import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from aiohttp.test_utils import AioHTTPTestCase

from plugins.base import PluginField, PluginManifest, PluginRefreshResult, ScreenPlugin
from server import ADMIN_PASSWORD_STATE_KEY, create_app


class FakeForecastPlugin(ScreenPlugin):
    def __init__(self):
        self.refresh_count = 0
        self.manifest = PluginManifest(
            plugin_id='fake_forecast',
            name='Fake Forecast',
            description='Test plugin.',
            default_refresh_interval_seconds=1,
            common_settings_namespace='forecast',
            common_settings_schema=(
                PluginField(name='apiKey', label='API Key', field_type='text', default=''),
            ),
            settings_schema=(
                PluginField(name='city', label='City', field_type='text', required=True),
                PluginField(name='country', label='Country', field_type='text', required=True),
            ),
            design_schema=(
                PluginField(name='title', label='Title', field_type='text', default=''),
            ),
        )

    async def refresh(self, *, settings, design, context, http_session, previous_state=None, common_settings=None):
        self.refresh_count += 1
        title = (design.get('title') or settings['city']).upper()
        return PluginRefreshResult(
            lines=[
                title[: context.cols],
                f"RUN {self.refresh_count}",
                settings['country'].upper(),
            ]
        )


class FlipOffServerTests(AioHTTPTestCase):
    async def get_application(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp_dir.name) / '.flipoff' / 'config.json'
        self.screens_path = Path(self.temp_dir.name) / '.flipoff' / 'screens.json'
        self.fake_plugin = FakeForecastPlugin()
        return create_app(
            admin_password='secret-password',
            config_path=self.config_path,
            screens_path=self.screens_path,
            plugins={self.fake_plugin.manifest.plugin_id: self.fake_plugin},
        )

    def tearDown(self):
        super().tearDown()
        self.temp_dir.cleanup()

    async def authenticate(self):
        response = await self.client.post(
            '/api/admin/session',
            json={'password': 'secret-password'},
        )
        self.assertEqual(response.status, 200)

    async def test_get_public_config_returns_defaults(self):
        response = await self.client.get('/api/config')
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(payload['cols'], 18)
        self.assertEqual(payload['rows'], 5)
        self.assertEqual(payload['messageDurationSeconds'], 4)
        self.assertEqual(payload['apiMessageDurationSeconds'], 30)
        self.assertGreater(len(payload['defaultMessages']), 0)

    async def test_get_message_returns_default_state(self):
        response = await self.client.get('/api/message')
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(
            payload,
            {
                'hasOverride': False,
                'lines': ['', '', '', '', ''],
                'updatedAt': None,
            },
        )

    async def test_post_message_wraps_and_centers_single_string(self):
        response = await self.client.post(
            '/api/message',
            json={'message': 'hello from the backend api'},
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertTrue(payload['hasOverride'])
        self.assertEqual(
            payload['lines'],
            ['', 'HELLO FROM THE', 'BACKEND API', '', ''],
        )
        self.assertIsNotNone(payload['updatedAt'])

    async def test_post_lines_pads_to_full_board_height(self):
        response = await self.client.post(
            '/api/message',
            json={'lines': ['hello world', 'remote mode']},
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(
            payload['lines'],
            ['HELLO WORLD', 'REMOTE MODE', '', '', ''],
        )

    async def test_post_rejects_overlong_lines(self):
        response = await self.client.post(
            '/api/message',
            json={'lines': ['X' * 19]},
        )
        self.assertEqual(response.status, 400)

        payload = await response.json()
        self.assertEqual(payload['error'], 'lines line 1 exceeds 18 characters.')

    async def test_post_rejects_message_that_cannot_fit(self):
        response = await self.client.post(
            '/api/message',
            json={
                'message': (
                    'alpha bravo charlie delta echo foxtrot golf hotel india juliet '
                    'kilo lima mike november oscar papa quebec romeo sierra tango '
                    'uniform victor whiskey xray yankee zulu'
                )
            },
        )
        self.assertEqual(response.status, 400)

        payload = await response.json()
        self.assertEqual(
            payload['error'],
            "'message' must fit within 5 lines of 18 characters.",
        )

    async def test_api_message_expires_back_to_default_rotation(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/config',
            json={
                'cols': 18,
                'rows': 5,
                'messageDurationSeconds': 4,
                'apiMessageDurationSeconds': 1,
            },
        )
        self.assertEqual(response.status, 200)

        post_response = await self.client.post('/api/message', json={'lines': ['timed override']})
        self.assertEqual(post_response.status, 200)

        await asyncio.sleep(1.2)
        current_state = await self.client.get('/api/message')
        payload = await current_state.json()
        self.assertFalse(payload['hasOverride'])
        self.assertEqual(payload['lines'], ['', '', '', '', ''])

    async def test_admin_config_requires_authentication(self):
        response = await self.client.get('/api/admin/config')
        self.assertEqual(response.status, 401)

    async def test_admin_screens_requires_authentication(self):
        response = await self.client.get('/api/admin/screens')
        self.assertEqual(response.status, 401)

    async def test_admin_config_update_changes_public_config(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/config',
            json={
                'cols': 20,
                'rows': 5,
                'messageDurationSeconds': 12,
                'apiMessageDurationSeconds': 45,
            },
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(payload['cols'], 20)
        self.assertEqual(payload['rows'], 5)
        self.assertEqual(payload['messageDurationSeconds'], 12)
        self.assertEqual(payload['apiMessageDurationSeconds'], 45)
        self.assertTrue(payload['hasAdminPassword'])

        public_config = await self.client.get('/api/config')
        public_payload = await public_config.json()
        self.assertEqual(public_payload['cols'], 20)
        self.assertEqual(public_payload['rows'], 5)
        self.assertEqual(public_payload['messageDurationSeconds'], 12)
        self.assertEqual(len(public_payload['defaultMessages'][0]), 5)

    async def test_admin_screens_update_changes_public_config_with_manual_screen(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/screens',
            json={
                'pluginCommonSettings': {},
                'screens': [
                    {
                        'type': 'manual',
                        'name': 'Welcome',
                        'enabled': True,
                        'lines': ['welcome home', 'simon'],
                    }
                ]
            },
        )
        self.assertEqual(response.status, 200)
        self.assertTrue(self.screens_path.exists())

        payload = await response.json()
        self.assertEqual(payload['screens'][0]['name'], 'Welcome')
        self.assertEqual(payload['screens'][0]['previewLines'][0], 'WELCOME HOME')

        public_config = await self.client.get('/api/config')
        public_payload = await public_config.json()
        self.assertEqual(public_payload['defaultMessages'][0], ['WELCOME HOME', 'SIMON', '', '', ''])
        self.assertEqual(
            json.loads(self.screens_path.read_text(encoding='utf-8'))['boards'][0]['screens'][0]['lines'],
            ['WELCOME HOME', 'SIMON'],
        )

    async def test_admin_screens_update_adds_plugin_screen_and_refreshes_cache(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/screens',
            json={
                'pluginCommonSettings': {},
                'screens': [
                    {
                        'type': 'plugin',
                        'name': 'London Forecast',
                        'enabled': True,
                        'pluginId': 'fake_forecast',
                        'refreshIntervalSeconds': 60,
                        'settings': {'city': 'London', 'country': 'GB'},
                        'design': {'title': 'LONDON 3 DAY'},
                    }
                ]
            },
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(payload['screens'][0]['pluginId'], 'fake_forecast')
        self.assertEqual(payload['screens'][0]['previewLines'][0], '')
        self.assertEqual(payload['screens'][0]['previewLines'][1], 'LONDON 3 DAY')
        self.assertEqual(payload['screens'][0]['previewLines'][2], 'RUN 1')

        public_config = await self.client.get('/api/config')
        public_payload = await public_config.json()
        self.assertEqual(public_payload['defaultMessages'][0][0], '')
        self.assertEqual(public_payload['defaultMessages'][0][1], 'LONDON 3 DAY')
        self.assertEqual(public_payload['defaultMessages'][0][2], 'RUN 1')

    async def test_plugin_screen_refresh_endpoint_updates_preview(self):
        await self.authenticate()
        create_response = await self.client.put(
            '/api/admin/screens',
            json={
                'pluginCommonSettings': {},
                'screens': [
                    {
                        'type': 'plugin',
                        'name': 'Weather',
                        'enabled': True,
                        'pluginId': 'fake_forecast',
                        'refreshIntervalSeconds': 60,
                        'settings': {'city': 'Paris', 'country': 'FR'},
                        'design': {'title': 'PARIS'},
                    }
                ]
            },
        )
        self.assertEqual(create_response.status, 200)
        created_payload = await create_response.json()
        screen_id = created_payload['screens'][0]['id']

        refresh_response = await self.client.post(f'/api/admin/screens/{screen_id}/refresh')
        self.assertEqual(refresh_response.status, 200)
        refresh_payload = await refresh_response.json()
        self.assertEqual(refresh_payload['screen']['previewLines'][2], 'RUN 2')

    async def test_plugin_screen_scheduler_refreshes_on_interval(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/screens',
            json={
                'pluginCommonSettings': {},
                'screens': [
                    {
                        'type': 'plugin',
                        'name': 'Ticker',
                        'enabled': True,
                        'pluginId': 'fake_forecast',
                        'refreshIntervalSeconds': 1,
                        'settings': {'city': 'Rome', 'country': 'IT'},
                        'design': {'title': 'ROME'},
                    }
                ]
            },
        )
        self.assertEqual(response.status, 200)

        await asyncio.sleep(1.2)
        public_config = await self.client.get('/api/config')
        public_payload = await public_config.json()
        self.assertEqual(public_payload['defaultMessages'][0][2], 'RUN 2')

    async def test_plugin_common_settings_persist_to_user_config(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/screens',
            json={
                'pluginCommonSettings': {
                    'forecast': {
                        'apiKey': 'secret-forecast-key',
                    }
                },
                'screens': [
                    {
                        'type': 'manual',
                        'name': 'Welcome',
                        'enabled': True,
                        'lines': ['hello'],
                    }
                ],
            },
        )
        self.assertEqual(response.status, 200)
        self.assertTrue(self.config_path.exists())

        stored_payload = json.loads(self.config_path.read_text(encoding='utf-8'))
        self.assertEqual(
            stored_payload,
            {
                'defaultBoardSlug': 'main',
                'boards': [
                    {
                        'slug': 'main',
                        'name': 'Main Board',
                        'cols': 18,
                        'rows': 5,
                        'messageDurationSeconds': 4,
                        'apiMessageDurationSeconds': 30,
                    }
                ],
                'adminPassword': 'secret-password',
                'pluginCommonSettings': {
                    'forecast': {
                        'apiKey': 'secret-forecast-key',
                    }
                }
            },
        )

        admin_screens = await self.client.get('/api/admin/screens')
        admin_payload = await admin_screens.json()
        self.assertEqual(admin_payload['pluginCommonSettings']['forecast']['apiKey'], 'secret-forecast-key')

        public_config = await self.client.get('/api/config')
        public_payload = await public_config.json()
        self.assertNotIn('pluginCommonSettings', public_payload)

    async def test_admin_config_can_change_password(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/config',
            json={
                'cols': 18,
                'rows': 5,
                'messageDurationSeconds': 4,
                'apiMessageDurationSeconds': 30,
                'adminPassword': 'changed-password',
            },
        )
        self.assertEqual(response.status, 200)

        stored_payload = json.loads(self.config_path.read_text(encoding='utf-8'))
        self.assertEqual(stored_payload['adminPassword'], 'changed-password')

        await self.client.delete('/api/admin/session')

        old_login = await self.client.post('/api/admin/session', json={'password': 'secret-password'})
        self.assertEqual(old_login.status, 401)

        new_login = await self.client.post('/api/admin/session', json={'password': 'changed-password'})
        self.assertEqual(new_login.status, 200)

    async def test_delete_message_clears_override(self):
        await self.client.post('/api/message', json={'lines': ['remote message']})

        response = await self.client.delete('/api/message')
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(
            payload,
            {
                'hasOverride': False,
                'lines': ['', '', '', '', ''],
                'updatedAt': None,
            },
        )

    async def test_websocket_receives_config_message_and_clear_events(self):
        ws = await self.client.ws_connect('/ws')

        config_event = await ws.receive_json()
        self.assertEqual(config_event['type'], 'config_state')
        self.assertEqual(config_event['payload']['cols'], 18)

        initial_message_event = await ws.receive_json()
        self.assertEqual(initial_message_event['type'], 'message_state')
        self.assertFalse(initial_message_event['payload']['hasOverride'])

        create_response = await self.client.post(
            '/api/message',
            json={'lines': ['live update']},
        )
        self.assertEqual(create_response.status, 200)

        created_event = await ws.receive_json()
        self.assertTrue(created_event['payload']['hasOverride'])
        self.assertEqual(
            created_event['payload']['lines'],
            ['LIVE UPDATE', '', '', '', ''],
        )

        clear_response = await self.client.delete('/api/message')
        self.assertEqual(clear_response.status, 200)

        cleared_event = await ws.receive_json()
        self.assertFalse(cleared_event['payload']['hasOverride'])
        self.assertEqual(cleared_event['payload']['lines'], ['', '', '', '', ''])

        await self.authenticate()
        await self.client.put(
            '/api/admin/screens',
            json={
                'screens': [
                    {
                        'type': 'manual',
                        'name': 'Short',
                        'enabled': True,
                        'lines': ['hello', 'world'],
                    }
                ]
            },
        )

        updated_config_event = await ws.receive_json()
        self.assertEqual(updated_config_event['type'], 'config_state')
        self.assertEqual(updated_config_event['payload']['defaultMessages'][0], ['HELLO', 'WORLD', '', '', ''])

        await ws.close()

    async def test_board_specific_config_and_default_board_switch(self):
        await self.authenticate()
        create_response = await self.client.post(
            '/api/admin/boards',
            json={'name': 'Lobby Board', 'slug': 'lobby-board'},
        )
        self.assertEqual(create_response.status, 200)

        update_response = await self.client.put(
            '/api/admin/config?board=lobby-board',
            json={
                'name': 'Lobby Board',
                'slug': 'lobby-board',
                'isDefault': True,
                'cols': 22,
                'rows': 5,
                'messageDurationSeconds': 9,
                'apiMessageDurationSeconds': 30,
            },
        )
        self.assertEqual(update_response.status, 200)

        default_config = await self.client.get('/api/config')
        default_payload = await default_config.json()
        self.assertEqual(default_payload['boardSlug'], 'lobby-board')
        self.assertEqual(default_payload['cols'], 22)

        board_page = await self.client.get('/lobby-board')
        self.assertEqual(board_page.status, 200)

    async def test_post_message_can_target_manual_screen_by_slugs(self):
        await self.authenticate()
        await self.client.put(
            '/api/admin/screens',
            json={
                'pluginCommonSettings': {},
                'screens': [
                    {
                        'type': 'manual',
                        'name': 'Welcome',
                        'slug': 'welcome-screen',
                        'enabled': True,
                        'lines': ['initial copy'],
                    }
                ],
            },
        )

        response = await self.client.post(
            '/api/message',
            json={
                'boardSlug': 'main',
                'screenSlug': 'welcome-screen',
                'message': 'screen specific update',
            },
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(payload['boardSlug'], 'main')
        self.assertEqual(payload['screen']['slug'], 'welcome-screen')
        self.assertEqual(payload['screen']['previewLines'][1], 'SCREEN SPECIFIC')
        self.assertEqual(payload['screen']['previewLines'][2], 'UPDATE')

        public_config = await self.client.get('/api/config')
        public_payload = await public_config.json()
        self.assertEqual(public_payload['defaultMessages'][0][1], 'SCREEN SPECIFIC')
        self.assertEqual(public_payload['defaultMessages'][0][2], 'UPDATE')


class FlipOffPasswordBootstrapTests(unittest.TestCase):
    def test_generated_password_is_written_and_reused_from_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / '.flipoff' / 'config.json'
            screens_path = Path(temp_dir) / '.flipoff' / 'screens.json'

            first_app = create_app(
                config_path=config_path,
                screens_path=screens_path,
                plugins={},
            )
            first_password = first_app[ADMIN_PASSWORD_STATE_KEY].password
            self.assertTrue(config_path.exists())

            stored_payload = json.loads(config_path.read_text(encoding='utf-8'))
            self.assertEqual(stored_payload['adminPassword'], first_password)

            second_app = create_app(
                config_path=config_path,
                screens_path=screens_path,
                plugins={},
            )
            self.assertEqual(second_app[ADMIN_PASSWORD_STATE_KEY].password, first_password)


if __name__ == '__main__':
    unittest.main()
