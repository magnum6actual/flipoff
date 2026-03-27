# FlipOff.

**Turn any TV into a retro split-flap display.** The classic flip-board look, without the $3,500 hardware. And it's free.

![FlipOff Screenshot](screenshot.png)

## What is this?

FlipOff is a free, open-source web app that emulates a classic mechanical split-flap (flip-board) airport terminal display — the kind you'd see at train stations and airports. It runs full-screen in any browser, turning a TV or large monitor into a beautiful retro display.

No accounts. No subscriptions. No $199 fee. Just open `index.html` and go.

## Features

- Realistic split-flap animation with colorful scramble transitions
- Authentic mechanical clacking sound (recorded from a real split-flap display)
- Auto-rotating inspirational quotes
- REST API for remotely updating the board
- WebSocket sync for instant updates across connected displays
- Password-protected `/admin` runtime configuration panel
- Fullscreen TV mode (press `F`)
- Keyboard controls for manual navigation
- Responsive from mobile to 4K displays
- Vanilla frontend plus a tiny Python server — no build tools, no npm

## Quick Start

1. Clone the repo
2. Install the backend dependency
3. Start the app with one Python command
4. Open the local URL in a browser
5. Click anywhere to enable audio
6. Press `F` for fullscreen TV mode

```bash
python3 -m pip install -r requirements.txt
python3 server.py
# Then open http://localhost:8080
```

If `~/.flipoff/config.json` does not contain an admin password yet, the server generates one on startup, writes it into the config file, and prints it to the console. That generated password is then reused on subsequent runs until you change it from `/admin`.

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

The Python server keeps the current remote message and display configuration in memory. Clients can update the board through a REST API, and every open display stays synchronized through a WebSocket connection.

The board starts at 18 columns by 5 rows. `message` payloads wrap on whole words, then the wrapped block is centered vertically while each line is centered horizontally by the board renderer.

Admin changes are saved under `~/.flipoff/`, so board size, screen timing, plugin settings, screens, and API override duration survive a restart.

## File Structure

```
flipoff/
  index.html           — Single-page app
  css/
    admin.css          — Admin page styling
    reset.css          — CSS reset
    layout.css         — Page layout (header, hero, board)
    board.css          — Board container and accent bars
    tile.css           — Tile styling and 3D flip animation
    responsive.css     — Media queries for all screen sizes
  js/
    admin.js           — Admin login and configuration UI
    main.js            — Entry point and UI wiring
    RemoteMessageSync.js — REST bootstrap and WebSocket sync
    Board.js           — Grid manager and transition orchestration
    Tile.js            — Individual tile animation logic
    SoundEngine.js     — Audio playback with Web Audio API
    MessageRotator.js  — Quote rotation timer
    KeyboardController.js — Keyboard shortcut handling
    constants.js       — Configuration (grid size, colors, quotes)
    flapAudio.js       — Embedded audio data (base64)
  server.py           — Single-process aiohttp server and API
  requirements.txt    — Python dependency list
  admin.html          — Password-protected admin page shell
```

Runtime data is stored outside the repo:
- `~/.flipoff/config.json` — Board settings, admin password, and plugin common settings
- `~/.flipoff/screens.json` — Screen definitions and cached plugin output

## Customization

Edit `js/constants.js` to change:
- **Fallback messages**: Update `DEFAULT_MESSAGES`
- **Fallback grid size**: Adjust `DEFAULT_GRID_COLS` and `DEFAULT_GRID_ROWS`
- **Timing**: Tweak `SCRAMBLE_DURATION`, `STAGGER_DELAY`, etc.
- **Colors**: Modify `SCRAMBLE_COLORS` and `ACCENT_COLORS`

Use `/admin` for the runtime configuration that the server actually serves:
- board columns and rows
- how many seconds each screen stays visible before the rotation advances
- the admin password
- the rotating default message array
- how many seconds an API message stays live before the display returns to the default rotation

## API

```bash
# Show the board update live in any open browser
curl -X POST http://localhost:8080/api/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"server driven updates are live"}'

# Read the current remote state
curl http://localhost:8080/api/message

# Pin a single wrapped message
curl -X POST http://localhost:8080/api/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"server driven updates are live"}'

# Pin explicit lines
curl -X POST http://localhost:8080/api/message \
  -H 'Content-Type: application/json' \
  -d '{"lines":["flight delayed","gate change"]}'

# Clear the remote override and resume local rotation
curl -X DELETE http://localhost:8080/api/message
```

## Admin

Start the server and open [http://localhost:8080/admin](http://localhost:8080/admin).

The admin panel lets you change:
- board columns and rows
- screen message duration in seconds for the default rotation
- the admin password stored in `~/.flipoff/config.json`
- the default rotating messages
- API message lifetime in seconds before the display falls back to the default rotation
- send a temporary remote message without leaving `/admin`
- clear the active remote override

## License

MIT — do whatever you want with it.
