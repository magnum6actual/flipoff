import unittest
from unittest.mock import AsyncMock, patch

from plugins.base import PluginContext
from plugins.github.open_work import GitHubOpenWorkPlugin
from plugins.github.repo_stats import GitHubRepoStatsPlugin


class GitHubRepoStatsPluginTests(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_shows_repository_by_default(self):
        plugin = GitHubRepoStatsPlugin()

        with patch(
            'plugins.github.repo_stats.fetch_repository',
            new=AsyncMock(return_value={
                'stargazers_count': 12,
                'subscribers_count': 7,
                'forks_count': 4,
            }),
        ):
            result = await plugin.refresh(
                settings={'repository': 'magnum6actual/flipoff'},
                design={},
                context=PluginContext(cols=32, rows=5),
                http_session=None,
            )

        self.assertEqual(
            result.lines,
            [
                'MAGNUM6ACTUAL/FLIPOFF',
                'STAR   12',
                'WATCH   7',
                'FORK    4',
            ],
        )

    async def test_refresh_can_hide_repository(self):
        plugin = GitHubRepoStatsPlugin()

        with patch(
            'plugins.github.repo_stats.fetch_repository',
            new=AsyncMock(return_value={
                'stargazers_count': 12,
                'subscribers_count': 7,
                'forks_count': 4,
            }),
        ):
            result = await plugin.refresh(
                settings={'repository': 'magnum6actual/flipoff'},
                design={'showRepository': False},
                context=PluginContext(cols=32, rows=5),
                http_session=None,
            )

        self.assertEqual(
            result.lines,
            [
                'STAR   12',
                'WATCH   7',
                'FORK    4',
            ],
        )

    async def test_refresh_aligns_numeric_column_for_mixed_width_values(self):
        plugin = GitHubRepoStatsPlugin()

        with patch(
            'plugins.github.repo_stats.fetch_repository',
            new=AsyncMock(return_value={
                'stargazers_count': 427,
                'subscribers_count': 2,
                'forks_count': 75,
            }),
        ):
            result = await plugin.refresh(
                settings={'repository': 'magnum6actual/flipoff'},
                design={'showRepository': False},
                context=PluginContext(cols=32, rows=5),
                http_session=None,
            )

        self.assertEqual(
            result.lines,
            [
                'STAR   427',
                'WATCH    2',
                'FORK    75',
            ],
        )


class GitHubOpenWorkPluginTests(unittest.TestCase):
    def test_placeholder_can_hide_repository(self):
        plugin = GitHubOpenWorkPlugin()

        lines = plugin.placeholder_lines(
            settings={'repository': 'magnum6actual/flipoff'},
            design={'showRepository': False},
            context=PluginContext(cols=32, rows=5),
        )

        self.assertEqual(lines, ['ISSUE  --', 'PR     --'])

    def test_placeholder_keeps_errors_visible_when_repository_is_hidden(self):
        plugin = GitHubOpenWorkPlugin()

        lines = plugin.placeholder_lines(
            settings={'repository': 'magnum6actual/flipoff'},
            design={'showRepository': False},
            context=PluginContext(cols=32, rows=5),
            error='rate limited',
        )

        self.assertEqual(lines, ['RATE LIMITED', 'ISSUE  --', 'PR     --'])


if __name__ == '__main__':
    unittest.main()
