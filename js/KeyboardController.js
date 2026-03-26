export class KeyboardController {
  constructor(rotator, soundEngine) {
    this.rotator = rotator;
    this.soundEngine = soundEngine;

    document.addEventListener('keydown', (e) => this._handleKey(e));
  }

  _handleKey(e) {
    // Don't capture when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.rotator.next();
        break;

      case 'ArrowRight':
        e.preventDefault();
        this.rotator.next();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        this.rotator.prev();
        break;

      case 'f':
      case 'F':
        e.preventDefault();
        this._toggleFullscreen();
        break;

      case 'm':
      case 'M':
        e.preventDefault();
        if (this.soundEngine) {
          const state = this.soundEngine.cycleSoundMode();
          this._showToast(state.label);
        }
        break;

      case 'Escape':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
        // Also hide shortcuts overlay
        const overlay = document.querySelector('.shortcuts-overlay');
        if (overlay) overlay.classList.remove('visible');
        break;
    }
  }

  _toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  _showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.style.cssText = `
        position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.8); color: #fff; padding: 8px 20px;
        border-radius: 8px; font-size: 14px; font-weight: 600;
        z-index: 9999; transition: opacity 0.3s; pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1200);
  }
}
