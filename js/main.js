import { Board } from './Board.js';
import { SoundEngine } from './SoundEngine.js';
import { MessageRotator } from './MessageRotator.js';
import { KeyboardController } from './KeyboardController.js';
import { RemoteMessageSync } from './RemoteMessageSync.js';
import { DEFAULT_DISPLAY_CONFIG, CONFIG_LOADED, MESSAGES } from './constants.js';
import { isDynamicMarker, initDynamicProviders, startWeatherRefresh } from './DynamicMessages.js';

// Module scripts are deferred — DOM is already parsed when this runs.
// Do NOT use DOMContentLoaded: top-level await in constants.js can cause
// that event to fire before this module executes, so the listener would miss it.
void bootstrap();

async function bootstrap() {
  const boardContainer = document.getElementById('board-container');
  if (!boardContainer) return;

  const soundEngine = new SoundEngine();

  // PR #2: Try fetching remote config first, fall back to local defaults
  const remoteSync = new RemoteMessageSync(handleRealtimeEvent, resolveBoardSlugFromPath());
  const displayConfig = await remoteSync.fetchConfig() || cloneConfig(DEFAULT_DISPLAY_CONFIG);
  const configSignature = serializeConfig(displayConfig);
  const backendAvailable = remoteSync._backendAvailable === true;

  // Show admin button only when backend is running
  const adminBtn = document.getElementById('admin-btn');
  if (adminBtn && backendAvailable) {
    adminBtn.style.display = '';
  }

  // Show config source indicator
  const configIndicator = document.getElementById('config-indicator');
  if (configIndicator) {
    if (!CONFIG_LOADED) {
      configIndicator.classList.add('offline');
      configIndicator.title = 'config.json not found — using built-in defaults';
    } else {
      configIndicator.classList.add('online');
      configIndicator.title = 'Loaded from config.json';
    }
  }

  // Inject one of each dynamic marker type (datetime, weather) from config.json.
  // The backend strips these, so we re-add them. Deduplicate to one per type.
  const seen = new Set();
  const dynamicMarkers = MESSAGES.filter(m => {
    if (!isDynamicMarker(m) || seen.has(m.dynamic)) return false;
    seen.add(m.dynamic);
    return true;
  });
  const staticMessages = displayConfig.defaultMessages;
  const allMessages = [...staticMessages, ...dynamicMarkers];

  let remoteOverrideActive = false;
  const board = new Board(boardContainer, soundEngine, displayConfig);
  const rotator = new MessageRotator(board, {
    messages: allMessages,
    messageDurationSeconds: displayConfig.messageDurationSeconds,
  });
  const keyboard = new KeyboardController(rotator, soundEngine, board);
  void keyboard;

  // Pre-load audio buffers immediately so they're ready when the user interacts.
  // The AudioContext starts suspended (browser autoplay policy) — we resume it
  // on the first user gesture so sound plays instantly without delay.
  const audioReady = soundEngine.init();
  let audioResumed = false;
  const resumeAudio = () => {
    if (audioResumed) return;
    audioResumed = true;
    audioReady.then(() => soundEngine.resume());
    document.removeEventListener('click', resumeAudio);
    document.removeEventListener('keydown', resumeAudio);
    document.removeEventListener('pointerdown', resumeAudio);
  };
  document.addEventListener('click', resumeAudio);
  document.addEventListener('keydown', resumeAudio);
  document.addEventListener('pointerdown', resumeAudio);

  // PR #4: Sound mode UI sync
  const volumeBtn = document.getElementById('volume-btn');
  const syncSoundUi = () => {
    if (!volumeBtn || !soundEngine.getSoundState) return;
    const state = soundEngine.getSoundState();
    volumeBtn.classList.toggle('muted', state.muted);
    volumeBtn.title = `Sound mode: ${state.label}`;
  };
  document.addEventListener('soundmodechange', syncSoundUi);
  syncSoundUi();

  if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
      resumeAudio();
      soundEngine.toggleMute();
    });
  }

  // PR #10: Control panel via BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    const { ControlChannel } = await import('./ControlChannel.js');
    const ch = new ControlChannel();
    ch.on('ping', () => ch.send('pong'));
    ch.on('message', ({ lines }) => { rotator.stop(); board.displayMessage(lines, { interrupt: true }); });
    ch.on('stop-rotation', () => rotator.stop());
    ch.on('start-rotation', () => {
      rotator.disableRemoteOverride({ showNextMessage: true, interrupt: true });
    });
    ch.on('set-messages', ({ messages }) => {
      rotator.stop();
      rotator.setMessages(messages);
      rotator.currentIndex = -1;
      rotator.start();
    });
  }

  // PR #10: Fullscreen button
  // stopPropagation prevents resumeAudio from consuming the user-activation
  // token needed by requestFullscreen().
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
  }

  // PR #10: Fullscreen tile resizing
  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    document.body.classList.toggle('fullscreen-active', isFs);

    if (isFs) {
      setTimeout(() => {
        const padH = 72;
        const padV = 60;
        const gap = 5;
        const maxW = (window.innerWidth - padH - (board.cols - 1) * gap) / board.cols;
        const maxH = (window.innerHeight - padV - (board.rows - 1) * gap) / board.rows;
        const size = Math.floor(Math.min(maxW, maxH));
        board.boardEl.style.setProperty('--tile-size', `${size}px`);
        board.boardEl.style.setProperty('--tile-gap', `${gap}px`);
      }, 100);
    } else {
      board.boardEl.style.removeProperty('--tile-size');
      board.boardEl.style.removeProperty('--tile-gap');
    }
  });

  // Countdown progress bar — only runs rAF when a countdown is active
  const countdownFill = document.getElementById('countdown-fill');
  if (countdownFill) {
    let countdownRaf = null;
    const updateCountdown = () => {
      const progress = rotator.getCountdownProgress();
      if (progress !== null) {
        countdownFill.style.width = `${(progress * 100).toFixed(1)}%`;
        countdownRaf = requestAnimationFrame(updateCountdown);
      } else {
        countdownFill.style.width = '0%';
        countdownRaf = null;
      }
    };
    // Poll every second to detect when countdown starts, then switch to rAF
    setInterval(() => {
      if (countdownRaf === null && rotator.getCountdownProgress() !== null) {
        countdownRaf = requestAnimationFrame(updateCountdown);
      }
    }, 1000);
  }

  // Initialize dynamic message providers (weather fetch, etc.) before starting
  await initDynamicProviders(allMessages);
  startWeatherRefresh();

  // PR #2: Remote message sync
  const initialMessageState = await remoteSync.fetchMessageState();
  if (initialMessageState?.hasOverride) {
    handleMessageState(initialMessageState);
  } else {
    rotator.start();
  }

  remoteSync.connect();

  function handleRealtimeEvent(event) {
    if (!event || !event.type || !event.payload) return;

    if (event.type === 'message_state') {
      handleMessageState(event.payload);
      return;
    }

    if (event.type === 'config_state') {
      handleConfigState(event.payload);
    }
  }

  function handleConfigState(nextConfig) {
    if (serializeConfig(nextConfig) !== configSignature) {
      window.location.reload();
    }
  }

  function handleMessageState(state) {
    if (!state || typeof state.hasOverride !== 'boolean') return;

    if (state.hasOverride) {
      remoteOverrideActive = true;
      rotator.enableRemoteOverride();
      board.displayMessage(Array.isArray(state.lines) ? state.lines : [], { interrupt: true });
      return;
    }

    if (remoteOverrideActive) {
      remoteOverrideActive = false;
      rotator.disableRemoteOverride({ showNextMessage: true, interrupt: true });
      return;
    }

    if (!rotator.hasStarted()) {
      rotator.start();
    }
  }
}

function cloneConfig(config) {
  return {
    cols: config.cols,
    rows: config.rows,
    messageDurationSeconds: config.messageDurationSeconds,
    apiMessageDurationSeconds: config.apiMessageDurationSeconds,
    defaultMessages: config.defaultMessages.map((m) =>
      (m !== null && typeof m === 'object' && !Array.isArray(m)) ? m : [...m]
    ),
  };
}

function serializeConfig(config) {
  return JSON.stringify({
    boardSlug: config.boardSlug,
    cols: config.cols,
    rows: config.rows,
    messageDurationSeconds: config.messageDurationSeconds,
    apiMessageDurationSeconds: config.apiMessageDurationSeconds,
    defaultMessages: config.defaultMessages,
  });
}

function resolveBoardSlugFromPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/index.html') return null;
  const [, candidate] = path.split('/');
  return candidate || null;
}

