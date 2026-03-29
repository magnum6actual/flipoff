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
    count_open_pull_requests,
    fetch_repository,
    format_aligned_metrics,
    normalize_repository,
    repository_heading,
)


class GitHubOpenWorkPlugin(ScreenPlugin):
    manifest = PluginManifest(
        plugin_id='github_open_work',
        name='GitHub Open Issues and PRs',
        description='Show the current number of open issues and open pull requests for a public GitHub repository.',
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
                placeholder='OPEN WORK',
            ),
            PluginField(
                name='showRepository',
                label='Show Organization / Repo',
                field_type='checkbox',
                default=True,
                help_text='Display the owner/repository line above the issue and PR counts.',
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
        repository_payload = await fetch_repository(owner, repo, http_session)
        open_prs = await count_open_pull_requests(owner, repo, http_session)
        open_issues_total = repository_payload.get('open_issues_count')
        try:
            open_issues = max(0, int(open_issues_total) - open_prs)
        except (TypeError, ValueError):
            open_issues = 0

        lines = self.with_optional_title(self._build_metric_lines(
            repository_heading(owner, repo, design=design),
            format_aligned_metrics([
                ('ISSUE', str(open_issues)),
                ('PR', str(open_prs)),
            ], context.cols),
            context.cols,
        ), design=design, context=context)

        return PluginRefreshResult(lines=lines[: context.rows])

    def placeholder_lines(self, *, settings, design, context: PluginContext, error=None):
        owner, repo = normalize_repository(settings.get('repository'))
        lines = self.with_optional_title(self._build_metric_lines(
            repository_heading(owner, repo, design=design, error=error),
            format_aligned_metrics([
                ('ISSUE', '--'),
                ('PR', '--'),
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

    def _fit(self, value: str, cols: int) -> str:
        return value[:cols]


PLUGIN = GitHubOpenWorkPlugin()
