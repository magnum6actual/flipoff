import { ConfigStore } from './ConfigStore.js';
import { Board } from './Board.js';
import { SoundEngine } from './SoundEngine.js';
import { MessageRotator } from './MessageRotator.js';
import { KeyboardController } from './KeyboardController.js';

document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container');
  const configStore = new ConfigStore({ applyRemoteOverrides: true });
  const soundEngine = new SoundEngine();
  const board = new Board(boardContainer, soundEngine);
  const rotator = new MessageRotator(board);
  const keyboard = new KeyboardController(rotator, soundEngine, (profile, label) => {
    board.updateSoundMode(label);
    const editable = configStore.getEditableConfig();
    editable.sound.profile = profile;
    configStore.updateLocalConfig(editable);
  });

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

  configStore.init().then(() => {
    configStore.subscribe(async (snapshot) => {
      soundEngine.applyConfig(snapshot.config.sound);
      board.applyConfig(snapshot.config);
      board.updateRemoteStatus(snapshot.status.remote);
      board.updateSoundMode(soundEngine.getProfileLabel());
      if (volumeBtn) {
        volumeBtn.classList.toggle('muted', snapshot.config.sound.profile === 'mute');
      }
      rotator.applyConfig(snapshot.config);

      if (rotator.currentIndex < 0) {
        rotator.start();
      } else if (!board.isTransitioning) {
        await rotator.refresh();
      }
    });
  });

  const volumeBtn = document.getElementById('volume-btn');
  if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
      initAudio();
      const profile = soundEngine.cycleProfile();
      board.updateSoundMode(soundEngine.getProfileLabel());
      const editable = configStore.getEditableConfig();
      editable.sound.profile = profile;
      configStore.updateLocalConfig(editable);
      volumeBtn.classList.toggle('muted', profile === 'mute');
    });
  }

  const ctaBtn = document.getElementById('cta-btn');
  if (ctaBtn) {
    ctaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      initAudio();
      boardContainer.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        document.documentElement.requestFullscreen().catch(() => {});
      }, 400);
    });
  }
});
