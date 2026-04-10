import { ConfigStore } from './ConfigStore.js';

const store = new ConfigStore({ applyRemoteOverrides: false });

const composerForm = document.getElementById('composer-form');
const messageInput = document.getElementById('message-input');
const clearBtn = document.getElementById('clear-btn');
const sendStatus = document.getElementById('send-status');
const boardSpec = document.getElementById('board-spec');
const lineCount = document.getElementById('line-count');

function normalizeLines(rawValue) {
  return String(rawValue || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function centerLines(lines, rows) {
  const visible = lines.slice(0, rows);
  const totalPadding = Math.max(0, rows - visible.length);
  const topPadding = Math.floor(totalPadding / 2);
  const bottomPadding = totalPadding - topPadding;

  return [
    ...Array.from({ length: topPadding }, () => ''),
    ...visible,
    ...Array.from({ length: bottomPadding }, () => '')
  ];
}

function updateLineCount() {
  const lines = messageInput.value.split(/\r?\n/).filter((line) => line.trim().length > 0);
  lineCount.textContent = lines.length === 1 ? '1 line' : `${lines.length} lines`;
}

function setStatus(text) {
  sendStatus.textContent = text;
}

function syncFromConfig() {
  const editable = store.getEditableConfig();
  const firstMessage = editable.messages.items[0];
  const rows = editable.grid.rows;
  const cols = editable.grid.cols;

  boardSpec.textContent = `Current board: ${cols} columns x ${rows} rows. Long lines will be clipped by the display.`;

  if (document.activeElement !== messageInput) {
    messageInput.value = firstMessage ? firstMessage.lines.join('\n').trim() : '';
    updateLineCount();
  }
}

function sendMessage() {
  const editable = store.getEditableConfig();
  const rows = editable.grid.rows;
  const lines = normalizeLines(messageInput.value);
  const centeredLines = centerLines(lines.length ? lines : [''], rows);
  const remoteEnabled = editable.remote.enabled;

  editable.messages.items = [
    {
      id: `live-${Date.now()}`,
      lines: centeredLines
    }
  ];

  store.updateLocalConfig(editable);
  setStatus(
    remoteEnabled
      ? 'Message sent locally. Remote sync is enabled, so the display may switch back on the next remote poll.'
      : 'Message sent. The display page should switch to it immediately.'
  );
}

composerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

messageInput.addEventListener('input', () => {
  updateLineCount();
  setStatus('Editing draft...');
});

clearBtn.addEventListener('click', () => {
  messageInput.value = '';
  updateLineCount();
  setStatus('Draft cleared. Nothing has been sent yet.');
});

store.init().then(() => {
  syncFromConfig();
  store.subscribe(() => {
    syncFromConfig();
  });
  setStatus('Ready.');
});
