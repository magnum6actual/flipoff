# FlipOff

Static split-flap board for browsers, TVs, kiosks, and signage screens.

FlipOff is a pure HTML/CSS/JavaScript app that renders a retro mechanical board effect without a build step or backend. The current version adds a dedicated message composer, an advanced control page, adaptive screen-proportion layout, and optional remote JSON polling for live updates.

![FlipOff Screenshot](screenshot.png)

## What This Version Includes

- Split-flap board display with staggered flip animation
- Dedicated `message.html` page for quick live message sending
- `control.html` page for runtime editing of messages, timing, sound, theme, and remote sync
- Adaptive grid layout that changes with the screen proportion
- Local live sync between tabs using `localStorage` and `BroadcastChannel`
- Optional remote config polling from a JSON endpoint
- Sound profiles: `soft`, `authentic`, `joke`, `mute`
- Static-first setup with no npm, build tool, or server dependency beyond a simple static file host

## Pages

- `index.html`: the display board
- `message.html`: quick composer for sending one message to the board
- `control.html`: advanced runtime control for the full config

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript with ES modules
- Browser `localStorage` for runtime config persistence
- Browser `BroadcastChannel` for cross-tab sync when available
- `fetch()` for optional remote polling

## Getting Started

### Option 1: Open Directly

Open `index.html` in a browser.

This works for the local runtime config features in many browsers, but a local static server is the safer option, especially when testing remote polling.

### Option 2: Run a Static Server

From the project directory:

```bash
python -m http.server 8091
```

Then open:

- `http://127.0.0.1:8091/index.html`
- `http://127.0.0.1:8091/message.html`
- `http://127.0.0.1:8091/control.html`

## Typical Workflow

1. Open `index.html` on the display screen.
2. Open `message.html` in another tab or device using the same browser profile when testing locally.
3. Type one line per board row and press `Send To Board`.
4. Use `control.html` when you want to change timing, board size, sound mode, theme preset, message rotation, or remote sync.

## Keyboard Shortcuts

On the display page:

| Key | Action |
| --- | --- |
| `Enter` / `Space` | Next message |
| `Arrow Left` | Previous message |
| `Arrow Right` | Next message |
| `F` | Toggle fullscreen |
| `M` | Cycle sound mode |
| `Escape` | Exit fullscreen |

## Message Composer

`message.html` is the fastest way to drive the board manually.

- Type one line per row
- Empty lines are ignored
- The message is centered vertically on the current board row count
- Sending a message replaces the active rotation with one live message
- If remote polling is enabled, the local message can be overwritten on the next successful remote poll

## Advanced Control

`control.html` edits the runtime config stored in the browser.

It lets you change:

- message interval
- board columns and rows
- flip timing and stagger behavior
- sound profile and volume
- named theme presets instead of raw hex colors
- remote polling URL, token, and interval
- full message rotation list

Theme presets currently available:

- `FlipOff Default`
- `Green Terminal`
- `Sunset Neon`
- `Black And White`
- `Arcade Bright`

## Remote Config Polling

The display page can periodically fetch a remote JSON file and use it as the active board config.

Important behavior:

- Remote overrides are applied on `index.html`
- `message.html` and `control.html` edit the local config only
- Remote config can replace local messages, grid settings, timing, theme, and sound
- The local `remote` section itself is not replaced by the fetched payload

### Supported Remote Sections

The fetched JSON can provide:

- `messages`
- `grid`
- `timing`
- `theme`
- `sound`

### Remote URL Safety Rules

- Public endpoints must use `https://`
- Plain `http://` is accepted only for localhost or private-network addresses such as `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, or `172.16.x.x` through `172.31.x.x`

### Example Remote JSON

```json
{
  "messages": {
    "intervalMs": 5000,
    "items": [
      { "id": "live-1", "lines": ["WELCOME", "TO FLIPOFF"] },
      { "id": "live-2", "lines": ["TRAIN A", "ON TIME"] }
    ]
  },
  "grid": {
    "cols": 24,
    "rows": 4
  },
  "timing": {
    "flipDurationMs": 120,
    "staggerDelayMs": 18,
    "settleDelayMs": 140,
    "maxOrderedSteps": 18
  },
  "theme": {
    "stepColors": ["#00AAFF", "#00FFCC", "#FFFFFF"],
    "accentColors": ["#00FF7F", "#FF4D00"]
  },
  "sound": {
    "profile": "soft",
    "volume": 0.8
  }
}
```

### How To Test Remote Polling

1. Host a JSON file like the example above.
2. Open `control.html`.
3. Enable `Remote pull sync`.
4. Enter the remote JSON URL.
5. Optionally enter a bearer token.
6. Set the polling interval.
7. Keep `index.html` open and watch the board update when the JSON changes.

## Adaptive Display Behavior

The board no longer uses only one fixed grid shape. It starts from the configured `cols` and `rows`, then adjusts the active grid at runtime based on the viewport proportion.

That means:

- wider screens can use more columns
- taller screens can use more rows
- tile size is recalculated to fit the available space
- resizing the browser or toggling fullscreen can rebuild the board layout while preserving the current message

## Project Structure

```text
flipoff/
  index.html
  message.html
  control.html
  README.md
  screenshot.png
  css/
    reset.css
    layout.css
    board.css
    tile.css
    responsive.css
    control.css
    message.css
  js/
    main.js
    Board.js
    Tile.js
    SoundEngine.js
    MessageRotator.js
    KeyboardController.js
    ConfigStore.js
    configSchema.js
    control.js
    message.js
    constants.js
    flapAudio.js
    text.js
```

## Runtime Architecture

- `js/main.js` boots the display page and enables remote overrides
- `js/Board.js` manages layout, adaptive sizing, tile orchestration, and display status
- `js/Tile.js` handles individual split-flap tile transitions
- `js/MessageRotator.js` rotates through configured messages
- `js/SoundEngine.js` manages sound profiles and playback
- `js/ConfigStore.js` handles local persistence, cross-tab sync, and remote polling
- `js/configSchema.js` validates and sanitizes config payloads
- `js/control.js` powers the advanced control page
- `js/message.js` powers the quick-send composer

## Notes

- Audio usually requires a user interaction before the browser will play sound
- Cross-tab live sync is best when the pages are opened in the same browser profile
- If remote sync is enabled, local quick-send messages are temporary unless the remote payload matches them

## License

MIT
