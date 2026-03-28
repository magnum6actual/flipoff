# FlipOff.

**Turn any TV into a retro split-flap display.** The classic flip-board look, without the $3,500 hardware. And it's free.

Access it live: ariesyous.github.io/flipoff/

![FlipOff Screenshot](screenshot.png)

## What is this?

FlipOff is a free, open-source web app that emulates a classic mechanical split-flap (flip-board) airport terminal display — the kind you'd see at train stations and airports. It runs full-screen in any browser, turning a TV or large monitor into a beautiful retro display.

No accounts. No subscriptions. No $199 fee. Just open `index.html` and go.

## Features

- Realistic split-flap animation with colorful scramble transitions
- Authentic mechanical clacking sound (recorded from a real split-flap display)
- Auto-rotating inspirational quotes
- Fullscreen TV mode (press `F`)
- Keyboard controls for manual navigation
- Works offline — zero external dependencies
- Responsive from mobile to 4K displays
- Pure vanilla HTML/CSS/JS — no frameworks, no build tools, no npm

## Quick Start

1. Clone the repo
2. Open `index.html` in a browser (or serve with any static file server)
3. Click anywhere to enable audio
4. Press `F` for fullscreen TV mode

```bash
# Or serve locally:
python3 -m http.server 8080
# Then open http://localhost:8080
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` / `Space` | Next message |
| `Arrow Left` | Previous message |
| `Arrow Right` | Next message |
| `F` | Toggle fullscreen |
| `M` | Toggle mute |
| `Escape` | Exit fullscreen |

## How It Works

Each tile on the board is an independent element that can animate through a scramble sequence (rapid random characters with colored backgrounds) before settling on the final character. Only tiles whose content changes between messages animate — just like a real mechanical board.

The sound is a single recorded audio clip of a real split-flap transition, played once per message change to perfectly sync with the visual animation.

## File Structure

```
flipoff/
  index.html           — Single-page app
  css/
    reset.css          — CSS reset
    layout.css         — Page layout (header, hero, board)
    board.css          — Board container and accent bars
    tile.css           — Tile styling and 3D flip animation
    responsive.css     — Media queries for all screen sizes
  js/
    main.js            — Entry point and UI wiring
    Board.js           — Grid manager and transition orchestration
    Tile.js            — Individual tile animation logic
    SoundEngine.js     — Audio playback with Web Audio API
    MessageRotator.js  — Quote rotation timer
    KeyboardController.js — Keyboard shortcut handling
    constants.js       — Configuration (grid size, colors, quotes)
    flapAudio.js       — Embedded audio data (base64)
```

## Customization

Edit `js/constants.js` to change:
- **Messages**: Add your own quotes or text
- **Grid size**: Adjust `GRID_COLS` and `GRID_ROWS`
- **Timing**: Tweak `SCRAMBLE_DURATION`, `STAGGER_DELAY`, etc.
- **Colors**: Modify `SCRAMBLE_COLORS` and `ACCENT_COLORS`

## License

MIT — do whatever you want with it.
