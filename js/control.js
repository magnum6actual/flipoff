import { ConfigStore } from './ConfigStore.js';
import { parseConfigPayload } from './configSchema.js';

const store = new ConfigStore({ applyRemoteOverrides: false });
let suppressFormUpdates = false;
let syncTimer = null;

const THEME_PRESETS = {
  flipoff: {
    stepColors: ['#00AAFF', '#00FFCC', '#AA00FF', '#FF2D00', '#FFCC00', '#FFFFFF'],
    accentColors: ['#00FF7F', '#FF4D00', '#AA00FF', '#00AAFF', '#00FFCC']
  },
  terminal: {
    stepColors: ['#C7FFD1', '#7CFF8A', '#36D46E', '#1E7F46', '#103D24'],
    accentColors: ['#7CFF8A', '#36D46E', '#C7FFD1']
  },
  sunset: {
    stepColors: ['#FFF1B8', '#FFCC70', '#FF8A5B', '#E94F7A', '#8F3DFF'],
    accentColors: ['#FFB347', '#FF6B6B', '#A855F7']
  },
  mono: {
    stepColors: ['#FFFFFF', '#D9D9D9', '#A6A6A6', '#737373', '#404040'],
    accentColors: ['#FFFFFF', '#A6A6A6', '#404040']
  },
  arcade: {
    stepColors: ['#00F5FF', '#00FF85', '#FFF200', '#FF7A00', '#FF2AD4'],
    accentColors: ['#00F5FF', '#FFF200', '#FF2AD4']
  }
};

const form = document.getElementById('control-form');
const messageList = document.getElementById('message-list');
const addMessageBtn = document.getElementById('add-message-btn');
const applyBtn = document.getElementById('apply-btn');
const exportBtn = document.getElementById('export-btn');
const importInput = document.getElementById('import-input');
const resetBtn = document.getElementById('reset-btn');
const importBtn = document.getElementById('import-btn');
const syncNote = document.getElementById('sync-note');

const DEBOUNCE_MS = 450;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function debounceSync() {
  clearTimeout(syncTimer);
  syncNote.classList.remove('is-error');
  syncNote.classList.add('is-pending');
  syncNote.textContent = 'Waiting for you to stop typing...';
  syncTimer = window.setTimeout(() => {
    persistForm();
  }, DEBOUNCE_MS);
}

function renderMessages(config) {
  messageList.innerHTML = '';
  config.messages.items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'message-card';
    card.innerHTML = `
      <div class="message-card-header">
        <h3>Message ${index + 1}</h3>
        <button type="button" class="ghost danger" data-action="remove-message">Remove</button>
      </div>
      <label>
        <span>ID</span>
        <input type="text" data-field="message-id" value="${escapeHtml(item.id)}">
      </label>
      <label>
        <span>Lines</span>
        <textarea rows="7" data-field="message-lines">${escapeHtml(item.lines.join('\n'))}</textarea>
      </label>
    `;

    card.querySelector('[data-action="remove-message"]').addEventListener('click', () => {
      const editable = store.getEditableConfig();
      editable.messages.items.splice(index, 1);
      if (!editable.messages.items.length) {
        editable.messages.items.push({ id: 'msg-1', lines: ['HELLO WORLD'] });
      }
      store.updateLocalConfig(editable);
      renderForm(store.getEditableConfig());
    });

    card.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('input', debounceSync);
    });

    messageList.appendChild(card);
  });
}

function areColorListsEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function findThemePresetKey(colors, paletteType) {
  const matchedPreset = Object.entries(THEME_PRESETS).find(([, preset]) =>
    areColorListsEqual(colors, preset[paletteType])
  );

  return matchedPreset ? matchedPreset[0] : 'flipoff';
}

function renderForm(config) {
  suppressFormUpdates = true;
  form.elements.intervalMs.value = config.messages.intervalMs;
  form.elements.cols.value = config.grid.cols;
  form.elements.rows.value = config.grid.rows;
  form.elements.flipDurationMs.value = config.timing.flipDurationMs;
  form.elements.staggerDelayMs.value = config.timing.staggerDelayMs;
  form.elements.settleDelayMs.value = config.timing.settleDelayMs;
  form.elements.maxOrderedSteps.value = config.timing.maxOrderedSteps;
  form.elements.soundProfile.value = config.sound.profile;
  form.elements.volume.value = config.sound.volume;
  form.elements.remoteEnabled.checked = config.remote.enabled;
  form.elements.remoteUrl.value = config.remote.url;
  form.elements.authToken.value = config.remote.authToken;
  form.elements.pollIntervalMs.value = config.remote.pollIntervalMs;
  form.elements.stepThemePreset.value = findThemePresetKey(config.theme.stepColors, 'stepColors');
  form.elements.accentThemePreset.value = findThemePresetKey(config.theme.accentColors, 'accentColors');
  renderMessages(config);
  syncNote.classList.remove('is-pending', 'is-error');
  syncNote.textContent = 'Saved locally. Open index.html or the local server to see live updates.';
  suppressFormUpdates = false;
}

function collectMessages() {
  return [...messageList.querySelectorAll('.message-card')].map((card, index) => ({
    id: card.querySelector('[data-field="message-id"]').value || `msg-${index + 1}`,
    lines: card.querySelector('[data-field="message-lines"]').value.split(/\r?\n/)
  }));
}

function persistForm() {
  if (suppressFormUpdates) {
    return;
  }

  clearTimeout(syncTimer);

  const editable = store.getEditableConfig();
  editable.messages.intervalMs = Number.parseInt(form.elements.intervalMs.value, 10);
  editable.messages.items = collectMessages();
  editable.grid.cols = Number.parseInt(form.elements.cols.value, 10);
  editable.grid.rows = Number.parseInt(form.elements.rows.value, 10);
  editable.timing.flipDurationMs = Number.parseInt(form.elements.flipDurationMs.value, 10);
  editable.timing.staggerDelayMs = Number.parseInt(form.elements.staggerDelayMs.value, 10);
  editable.timing.settleDelayMs = Number.parseInt(form.elements.settleDelayMs.value, 10);
  editable.timing.maxOrderedSteps = Number.parseInt(form.elements.maxOrderedSteps.value, 10);
  editable.theme.stepColors = [...(THEME_PRESETS[form.elements.stepThemePreset.value]?.stepColors || THEME_PRESETS.flipoff.stepColors)];
  editable.theme.accentColors = [...(THEME_PRESETS[form.elements.accentThemePreset.value]?.accentColors || THEME_PRESETS.flipoff.accentColors)];
  editable.sound.profile = form.elements.soundProfile.value;
  editable.sound.volume = Number.parseFloat(form.elements.volume.value);
  editable.remote.enabled = form.elements.remoteEnabled.checked;
  editable.remote.url = form.elements.remoteUrl.value;
  editable.remote.authToken = form.elements.authToken.value;
  editable.remote.pollIntervalMs = Number.parseInt(form.elements.pollIntervalMs.value, 10);
  store.updateLocalConfig(editable);
  syncNote.classList.remove('is-pending', 'is-error');
  syncNote.textContent = 'Saved locally. Live display tabs will update when browser sync is available.';
}

function applyNow() {
  persistForm();
  syncNote.classList.remove('is-pending', 'is-error');
  syncNote.textContent = 'Sent to the board. Display tabs should refresh now.';
}

addMessageBtn.addEventListener('click', () => {
  const editable = store.getEditableConfig();
  editable.messages.items.push({
    id: `msg-${editable.messages.items.length + 1}`,
    lines: ['NEW MESSAGE', 'EMOJIS WELCOME']
  });
  store.updateLocalConfig(editable);
  renderForm(store.getEditableConfig());
});

exportBtn.addEventListener('click', () => {
  const payload = JSON.stringify(store.getEditableConfig(), null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'flipoff-config.json';
  link.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
  importInput.click();
});

importInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const imported = parseConfigPayload(text);
    store.updateLocalConfig(imported);
    renderForm(store.getEditableConfig());
    syncNote.classList.remove('is-pending', 'is-error');
    syncNote.textContent = 'Imported config successfully.';
  } catch (error) {
    syncNote.classList.remove('is-pending');
    syncNote.classList.add('is-error');
    syncNote.textContent = `Import failed: ${error.message}`;
  }
});

resetBtn.addEventListener('click', () => {
  store.resetLocalConfig();
  renderForm(store.getEditableConfig());
  syncNote.classList.remove('is-pending', 'is-error');
  syncNote.textContent = 'Defaults restored.';
});

applyBtn.addEventListener('click', () => {
  applyNow();
});

form.addEventListener('input', debounceSync);

store.init().then(() => {
  renderForm(store.getEditableConfig());
  store.subscribe(() => {
    if (!document.hasFocus()) {
      renderForm(store.getEditableConfig());
    }
  });
});
