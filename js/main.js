import { Board } from './Board.js';
import { SoundEngine } from './SoundEngine.js';
import { MessageRotator } from './MessageRotator.js';
import { KeyboardController } from './KeyboardController.js';
import { RemoteMessageSync } from './RemoteMessageSync.js';
import { DEFAULT_DISPLAY_CONFIG } from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
  void bootstrap();
});

async function bootstrap() {
  const boardContainer = document.getElementById('board-container');
  const soundEngine = new SoundEngine();
  const remoteSync = new RemoteMessageSync(handleRealtimeEvent, resolveBoardSlugFromPath());
  const displayConfig = await remoteSync.fetchConfig() || cloneConfig(DEFAULT_DISPLAY_CONFIG);
  const configSignature = serializeConfig(displayConfig);

  let remoteOverrideActive = false;
  const board = new Board(boardContainer, soundEngine, displayConfig);
  const rotator = new MessageRotator(board, {
    messages: displayConfig.defaultMessages,
    messageDurationSeconds: displayConfig.messageDurationSeconds,
  });
  const keyboard = new KeyboardController(rotator, soundEngine);

  // Avoid unused lint noise in environments that inspect bindings.
  void keyboard;

  // Initialize audio on first user interaction (browser autoplay policy)
  let audioInitialized = false;
  const initAudio = async () => {
    if (audioInitialized) return;
    audioInitialized = true;
    await soundEngine.init();
    soundEngine.resume();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  // Volume toggle button in header
  const volumeBtn = document.getElementById('volume-btn');
  if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
      void initAudio();
      const muted = soundEngine.toggleMute();
      volumeBtn.classList.toggle('muted', muted);
    });
  }

  // "Get Early Access" button: scroll to board and go fullscreen
  const ctaBtn = document.getElementById('cta-btn');
  if (ctaBtn) {
    ctaBtn.addEventListener('click', (event) => {
      event.preventDefault();
      void initAudio();
      boardContainer.scrollIntoView({ behavior: 'smooth' });
      window.setTimeout(() => {
        document.documentElement.requestFullscreen().catch(() => {});
      }, 400);
    });
  }

  const initialMessageState = await remoteSync.fetchMessageState();
  if (initialMessageState && initialMessageState.hasOverride) {
    handleMessageState(initialMessageState);
  } else {
    rotator.start();
  }

  remoteSync.connect();

  function handleRealtimeEvent(event) {
    if (!event || !event.type || !event.payload) {
      return;
    }

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
    if (!state || typeof state.hasOverride !== 'boolean') {
      return;
    }

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
    defaultMessages: config.defaultMessages.map((message) => [...message]),
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
  if (path === '/' || path === '/index.html') {
    return null;
  }

  const [, candidate] = path.split('/');
  return candidate || null;
}
