import { Board } from './Board.js';
import { SoundEngine } from './SoundEngine.js';
import { MessageRotator } from './MessageRotator.js';
import { KeyboardController } from './KeyboardController.js';
import { QuoteService } from './QuoteService.js';

document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container');
  const soundEngine    = new SoundEngine();
  const quoteService   = new QuoteService();

  let board   = new Board(boardContainer, soundEngine);
  let rotator = new MessageRotator(board, quoteService.getMessages(board.cols));
  const keyboard = new KeyboardController(rotator, soundEngine);

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

  // Start message rotation (shows LOADING placeholder until API responds)
  rotator.start();

  // When API quotes arrive for the active category, swap the pool immediately
  quoteService.onUpdate = (arrivedCat) => {
    if (arrivedCat === quoteService.currentCategory) {
      rotator.stop();
      rotator.setMessages(quoteService.getMessages(board.cols));
      rotator.start();
    }
  };

  // Fire initial background API fetch for the 'all' pool
  quoteService.start();

  // ── Volume toggle ──────────────────────────────────────────────────────────
  const volumeBtn = document.getElementById('volume-btn');
  if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
      initAudio();
      const muted = soundEngine.toggleMute();
      volumeBtn.classList.toggle('muted', muted);
    });
  }

  // ── "Get Early Access" CTA ────────────────────────────────────────────────
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

  // ── Controls panel ─────────────────────────────────────────────────────────
  const controlsToggle = document.getElementById('controls-toggle');
  const controlsPanel  = document.getElementById('controls-panel');
  const closeControls  = document.getElementById('close-controls');

  if (controlsToggle && controlsPanel) {
    controlsToggle.addEventListener('click', () => {
      controlsPanel.classList.toggle('open');
    });

    if (closeControls) {
      closeControls.addEventListener('click', () => {
        controlsPanel.classList.remove('open');
      });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (
        controlsPanel.classList.contains('open') &&
        !controlsPanel.contains(e.target) &&
        e.target !== controlsToggle
      ) {
        controlsPanel.classList.remove('open');
      }
    });

    // Category chips
    const chips = controlsPanel.querySelectorAll('.category-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const cat = chip.dataset.category;
        quoteService.setCategory(cat);

        // Keep onUpdate scoped to the active category
        quoteService.onUpdate = (arrivedCat) => {
          if (arrivedCat === quoteService.currentCategory) {
            rotator.stop();
            rotator.setMessages(quoteService.getMessages(board.cols));
            rotator.start();
          }
        };

        rotator.stop();
        rotator.setMessages(quoteService.getMessages(board.cols));
        rotator.start();
      });
    });

    // Interval select
    const intervalSelect = document.getElementById('interval-select');
    if (intervalSelect) {
      intervalSelect.addEventListener('change', () => {
        const seconds = parseInt(intervalSelect.value, 10);
        rotator.setDisplayInterval(seconds * 1000);
      });
    }
  }

  // ── Responsive grid rebuild on tier change ────────────────────────────────
  let currentTier = Board.getGridTier();

  const rebuildBoard = () => {
    const newTier = Board.getGridTier();
    if (newTier !== currentTier) {
      currentTier = newTier;
      rotator.stop();
      boardContainer.innerHTML = '';
      board = new Board(boardContainer, soundEngine);
      rotator.rebuild(board);
      rotator.setMessages(quoteService.getMessages(board.cols));
      rotator.start();
    }
  };

  // ── Rebuild on fullscreen enter/exit ──────────────────────────────────────
  document.addEventListener('fullscreenchange', () => {
    // Small delay ensures innerWidth/Height reflect the new state
    setTimeout(rebuildBoard, 50);
  });

  // ── Responsive grid rebuild on breakpoint change ───────────────────────────
  let resizeDebounce = null;

  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(rebuildBoard, 200);
  });
});

