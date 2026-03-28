import { ControlChannel } from './ControlChannel.js';
import { wrapToBoard, centerLine } from './boardFormatter.js';
import { GRID_COLS, GRID_ROWS, TOTAL_TRANSITION } from './constants.js';

// ─── Channel ──────────────────────────────────────────────────────────────────

let channel = null;
let connected = false;

function initChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    document.querySelector('.ctrl-body').innerHTML =
      '<p class="no-support">Your browser does not support cross-tab control.<br>Try Chrome, Firefox, or Edge.</p>';
    return;
  }

  channel = new ControlChannel();

  channel.on('pong', () => {
    connected = true;
    setStatus(true);
  });

  // Ping on load
  channel.send('ping');

  // Re-ping every 5 seconds to detect display tab opening/closing
  setInterval(() => {
    connected = false;
    channel.send('ping');
    setTimeout(() => { if (!connected) setStatus(false); }, 700);
  }, 5000);
}

function setStatus(isConnected) {
  document.getElementById('status-dot').classList.toggle('connected', isConnected);
  document.getElementById('status-text').textContent =
    isConnected ? 'connected to display' : 'no display';
}

function send(type, payload = {}) {
  if (channel) channel.send(type, payload);
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ─── Preview helper ────────────────────────────────────────────────────────────

function renderPreview(el, lines) {
  const rows = lines.slice(0, GRID_ROWS);
  while (rows.length < GRID_ROWS) rows.push('');
  el.textContent = rows.map(centerLine).join('\n');
}

function blankPreview(el) {
  el.textContent = Array(GRID_ROWS).fill(' '.repeat(GRID_COLS)).join('\n');
}

// ─── Custom Message Mode ───────────────────────────────────────────────────────

function initCustomMode() {
  const input = document.getElementById('custom-input');
  const preview = document.getElementById('custom-preview');

  const update = () => renderPreview(preview, wrapToBoard(input.value));
  update();
  input.addEventListener('input', update);

  document.getElementById('custom-send').addEventListener('click', () => {
    const lines = wrapToBoard(input.value);
    send('stop-rotation');
    send('message', { lines });
  });

  document.getElementById('resume-custom').addEventListener('click', () => {
    send('start-rotation');
  });
}

// ─── Clock Mode ────────────────────────────────────────────────────────────────

function initClockMode() {
  const formatSel = document.getElementById('clock-format');
  const display   = document.getElementById('clock-display');
  const preview   = document.getElementById('clock-preview');
  const startBtn  = document.getElementById('clock-start');
  const stopBtn   = document.getElementById('clock-stop');

  let clockActive = false;
  let lastSentAt  = 0;
  let lastSentKey = '';

  const DAYS   = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

  function getLines() {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    const ss  = String(now.getSeconds()).padStart(2, '0');
    const fmt = formatSel.value;

    if (fmt === 'hhmm') {
      display.textContent = `${hh}:${mm}`;
      return ['', '', `${hh}:${mm}`, '', ''];
    }
    if (fmt === 'hhmmss') {
      display.textContent = `${hh}:${mm}:${ss}`;
      return ['', '', `${hh}:${mm}:${ss}`, '', ''];
    }
    // full
    const dateStr = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
    display.textContent = `${hh}:${mm}:${ss}`;
    return ['', `${hh}:${mm}:${ss}`, '', dateStr, ''];
  }

  function tick() {
    const lines = getLines();
    renderPreview(preview, lines);

    if (!clockActive) return;
    const key = lines.join('|');
    const now = Date.now();
    if (key !== lastSentKey && now - lastSentAt >= TOTAL_TRANSITION) {
      send('message', { lines });
      lastSentAt  = now;
      lastSentKey = key;
    }
  }

  tick();
  formatSel.addEventListener('change', tick);
  setInterval(tick, 1000);

  startBtn.addEventListener('click', () => {
    send('stop-rotation');
    clockActive = true;
    lastSentAt  = 0;
    lastSentKey = '';
    tick();
    startBtn.style.display = 'none';
    stopBtn.style.display  = '';
  });

  stopBtn.addEventListener('click', () => {
    clockActive = false;
    startBtn.style.display = '';
    stopBtn.style.display  = 'none';
  });

  document.getElementById('resume-clock').addEventListener('click', () => {
    clockActive = false;
    startBtn.style.display = '';
    stopBtn.style.display  = 'none';
    send('start-rotation');
  });
}

// ─── Countdown Mode ────────────────────────────────────────────────────────────

function initCountdownMode() {
  const targetInput = document.getElementById('countdown-target');
  const labelInput  = document.getElementById('countdown-label');
  const display     = document.getElementById('countdown-display');
  const preview     = document.getElementById('countdown-preview');
  const startBtn    = document.getElementById('countdown-start');
  const stopBtn     = document.getElementById('countdown-stop');

  let countdownActive = false;
  let lastSentAt      = 0;
  let lastSentKey     = '';

  const pad2 = n => String(n).padStart(2, '0');

  // Default to 1 hour from now
  const d = new Date(Date.now() + 3600000);
  targetInput.value = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  function getLines() {
    const target = new Date(targetInput.value);
    if (isNaN(target.getTime())) {
      display.textContent = 'INVALID';
      return ['', 'INVALID', 'DATE/TIME', '', ''];
    }

    const diff      = Math.max(0, target - Date.now());
    const totalSecs = Math.floor(diff / 1000);
    const days      = Math.floor(totalSecs / 86400);
    const hrs       = Math.floor((totalSecs % 86400) / 3600);
    const mins      = Math.floor((totalSecs % 3600) / 60);
    const secs      = totalSecs % 60;

    const timeStr = days > 0
      ? `${days}D ${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`
      : `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`;

    display.textContent = timeStr;

    const label = labelInput.value.trim().toUpperCase().slice(0, GRID_COLS) || '';
    return label
      ? ['', label, '', timeStr, '']
      : ['', '', timeStr, '', ''];
  }

  function tick() {
    const lines = getLines();
    renderPreview(preview, lines);

    if (!countdownActive) return;
    const key = lines.join('|');
    const now = Date.now();
    if (key !== lastSentKey && now - lastSentAt >= TOTAL_TRANSITION) {
      send('message', { lines });
      lastSentAt  = now;
      lastSentKey = key;
    }
  }

  tick();
  targetInput.addEventListener('change', tick);
  labelInput.addEventListener('input', tick);
  setInterval(tick, 1000);

  startBtn.addEventListener('click', () => {
    send('stop-rotation');
    countdownActive = true;
    lastSentAt      = 0;
    lastSentKey     = '';
    tick();
    startBtn.style.display = 'none';
    stopBtn.style.display  = '';
  });

  stopBtn.addEventListener('click', () => {
    countdownActive = false;
    startBtn.style.display = '';
    stopBtn.style.display  = 'none';
  });

  document.getElementById('resume-countdown').addEventListener('click', () => {
    countdownActive = false;
    startBtn.style.display = '';
    stopBtn.style.display  = 'none';
    send('start-rotation');
  });
}

// ─── Queue Mode ────────────────────────────────────────────────────────────────

function initQueueMode() {
  const queueInput   = document.getElementById('queue-input');
  const queueListEl  = document.getElementById('queue-list');
  const queueEmptyEl = document.getElementById('queue-empty');
  const previewEl    = document.getElementById('queue-preview');
  const intervalSel  = document.getElementById('queue-interval');

  let queue        = []; // array of string[5]
  let dragSrcIdx   = null;
  let queueTimer   = null;

  function updatePreview() {
    if (queue.length === 0) { blankPreview(previewEl); return; }
    renderPreview(previewEl, queue[0]);
  }

  function renderList() {
    // Clear everything except the empty placeholder
    Array.from(queueListEl.children).forEach(li => {
      if (li !== queueEmptyEl) li.remove();
    });
    queueEmptyEl.style.display = queue.length === 0 ? '' : 'none';

    queue.forEach((lines, idx) => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.idx = String(idx);

      const handle = document.createElement('span');
      handle.className = 'queue-drag-handle';
      handle.textContent = '⠿';

      const text = document.createElement('div');
      text.className = 'queue-item-text';
      text.textContent = lines.filter(l => l.trim()).join(' / ');

      const del = document.createElement('button');
      del.className = 'btn-danger';
      del.textContent = 'Remove';
      del.addEventListener('click', () => {
        queue.splice(idx, 1);
        renderList();
        updatePreview();
      });

      li.appendChild(handle);
      li.appendChild(text);
      li.appendChild(del);

      li.addEventListener('dragstart', (e) => {
        dragSrcIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (dragSrcIdx !== null && dragSrcIdx !== idx) {
          const [moved] = queue.splice(dragSrcIdx, 1);
          queue.splice(idx, 0, moved);
          dragSrcIdx = null;
          renderList();
          updatePreview();
        }
      });

      queueListEl.appendChild(li);
    });
  }

  document.getElementById('queue-add').addEventListener('click', () => {
    const text = queueInput.value.trim();
    if (!text) return;
    queue.push(wrapToBoard(text));
    queueInput.value = '';
    renderList();
    updatePreview();
  });

  // Also add on Enter (without shift) in the textarea
  queueInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('queue-add').click();
    }
  });

  document.getElementById('queue-start').addEventListener('click', () => {
    if (queue.length === 0) return;
    clearInterval(queueTimer);
    const interval = parseInt(intervalSel.value);
    let idx = 0;

    send('stop-rotation');
    send('message', { lines: queue[0] });

    queueTimer = setInterval(() => {
      idx = (idx + 1) % queue.length;
      send('message', { lines: queue[idx] });
    }, interval);
  });

  document.getElementById('resume-queue').addEventListener('click', () => {
    clearInterval(queueTimer);
    send('start-rotation');
  });

  renderList();
  updatePreview();
}

// ─── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initChannel();
  initTabs();
  initCustomMode();
  initClockMode();
  initCountdownMode();
  initQueueMode();
});
