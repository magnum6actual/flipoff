from __future__ import annotations

from ..base import (
    PluginContext,
    PluginField,
    PluginManifest,
    PluginRefreshResult,
    ScreenPlugin,
)
from .lib.common import (
    DEFAULT_GITHUB_REPOSITORY,
    fetch_repository,
    format_aligned_metrics,
    normalize_repository,
    repository_heading,
)


class GitHubRepoStatsPlugin(ScreenPlugin):
    manifest = PluginManifest(
        plugin_id='github_repo_stats',
        name='GitHub Stars, Watches, Forks',
        description='Show stars, watches, and forks for a public GitHub repository.',
        default_refresh_interval_seconds=300,
        settings_schema=(
            PluginField(
                name='repository',
                label='Repository',
                field_type='text',
                default=DEFAULT_GITHUB_REPOSITORY,
                placeholder='owner/repo',
                help_text="Uses the GitHub REST API for public repositories. Leave blank for 'magnum6actual/flipoff'.",
            ),
        ),
        design_schema=(
            PluginField(
                name='title',
                label='Title Override',
                field_type='text',
                default='',
                placeholder='GITHUB STATS',
            ),
            PluginField(
                name='showRepository',
                label='Show Organization / Repo',
                field_type='checkbox',
                default=True,
                help_text='Display the owner/repository line above the GitHub metrics.',
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
        owner, repo = normalize_repository(settings.get('repository'))
        payload = await fetch_repository(owner, repo, http_session)

        lines = self.with_optional_title(self._build_metric_lines(
            repository_heading(owner, repo, design=design),
            format_aligned_metrics([
                ('STAR', self._number(payload.get('stargazers_count'))),
                ('WATCH', self._number(payload.get('subscribers_count', payload.get('watchers_count')))),
                ('FORK', self._number(payload.get('forks_count'))),
            ], context.cols),
            context.cols,
        ), design=design, context=context)

        return PluginRefreshResult(lines=lines[: context.rows])

    def placeholder_lines(self, *, settings, design, context: PluginContext, error=None):
        owner, repo = normalize_repository(settings.get('repository'))
        lines = self.with_optional_title(self._build_metric_lines(
            repository_heading(owner, repo, design=design, error=error),
            format_aligned_metrics([
                ('STAR', '--'),
                ('WATCH', '--'),
                ('FORK', '--'),
            ], context.cols),
            context.cols,
        ), design=design, context=context)
        return lines[: context.rows]

    def _build_metric_lines(self, heading: str | None, metrics: list[str], cols: int) -> list[str]:
        lines: list[str] = []
        if heading:
            lines.append(self._fit(heading, cols))

        lines.extend(self._fit(metric, cols) for metric in metrics)
        return lines

    def _number(self, value) -> str:
        try:
            return str(int(value))
        except (TypeError, ValueError):
            return '--'

    def _fit(self, value: str, cols: int) -> str:
        return value[:cols]


PLUGIN = GitHubRepoStatsPlugin()
