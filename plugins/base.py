from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from aiohttp import ClientSession


@dataclass(frozen=True)
class PluginFieldOption:
    label: str
    value: str

    def serialize(self) -> dict[str, str]:
        return {
            'label': self.label,
            'value': self.value,
        }


@dataclass(frozen=True)
class PluginField:
    name: str
    label: str
    field_type: str
    required: bool = False
    default: Any = None
    placeholder: str = ''
    help_text: str = ''
    options: tuple[PluginFieldOption, ...] = ()

    def serialize(self) -> dict[str, Any]:
        payload = {
            'name': self.name,
            'label': self.label,
            'type': self.field_type,
            'required': self.required,
            'default': self.default,
            'placeholder': self.placeholder,
            'helpText': self.help_text,
        }

        if self.options:
            payload['options'] = [option.serialize() for option in self.options]

        return payload


@dataclass(frozen=True)
class PluginManifest:
    plugin_id: str
    name: str
    description: str
    default_refresh_interval_seconds: int
    settings_schema: tuple[PluginField, ...] = ()
    design_schema: tuple[PluginField, ...] = ()
    common_settings_namespace: str = ''
    common_settings_schema: tuple[PluginField, ...] = ()

    def serialize(self) -> dict[str, Any]:
        return {
            'id': self.plugin_id,
            'name': self.name,
            'description': self.description,
            'defaultRefreshIntervalSeconds': self.default_refresh_interval_seconds,
            'settingsSchema': [field.serialize() for field in self.settings_schema],
            'designSchema': [field.serialize() for field in self.design_schema],
            'commonSettingsNamespace': self.common_settings_namespace,
            'commonSettingsSchema': [field.serialize() for field in self.common_settings_schema],
        }


@dataclass(frozen=True)
class PluginContext:
    cols: int
    rows: int


@dataclass
class PluginRefreshResult:
    lines: list[str]
    meta: dict[str, Any] = field(default_factory=dict)


class ScreenPlugin:
    manifest: PluginManifest

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
        raise NotImplementedError

    def placeholder_lines(
        self,
        *,
        settings: dict[str, Any],
        design: dict[str, Any],
        context: PluginContext,
        error: str | None = None,
    ) -> list[str]:
        lines = self.with_optional_title(
            [(error or 'NO DATA').upper()[: context.cols]],
            design=design,
            context=context,
        )
        return lines[: context.rows]

    def get_title_line(self, *, design: dict[str, Any], context: PluginContext) -> str | None:
        title = str(design.get('title') or '').strip().upper()
        if not title:
            return None
        return title[: context.cols]

    def with_optional_title(
        self,
        lines: list[str],
        *,
        design: dict[str, Any],
        context: PluginContext,
    ) -> list[str]:
        title_line = self.get_title_line(design=design, context=context)
        if title_line:
            return [title_line, '', *lines]
        return lines
