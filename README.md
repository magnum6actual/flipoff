# FlipOff.

**Turn any TV into a retro split-flap display.** The classic flip-board look, without the $3,500 hardware. And it's free.

![FlipOff Screenshot](screenshot.png)

## What is this?

FlipOff is a free, open-source web app that emulates a classic mechanical split-flap (flip-board) airport terminal display — the kind you'd see at train stations and airports. It runs full-screen in any browser, turning a TV or large monitor into a beautiful retro display.

No accounts. No subscriptions. No $199 fee. Just open `index.html` and go.

## Features

- Realistic split-flap animation with mechanical character-stepping (top/bottom flap halves)
- **Dynamic messages**: live date/time (🕐 with yellow airport-board styling) and weather (🌡️ with temperature-based color gradient blue→cyan→green→yellow→orange→red)
- Weather shows city, country flag + full name, temperature, and condition — auto-detected from IP, refreshed every 10 minutes
- Multiple sound modes: Authentic (default), Soft, Joke (rubber duck + fart), Mute — with stereo panning per tile
- Auto-rotating messages with shuffle — date/time always first, weather second, then random rotation
- Display modes: Color, Matrix, Grayscale accent palettes
- Countdown progress bar showing time until next message (hidden in fullscreen)
- Config source indicator (green dot = config.json loaded, orange = using built-in defaults)
- Control panel for custom messages, clock, countdown, and message queue (same-browser, no server needed)
- Optional Python backend with admin dashboard, plugin system, and real-time WebSocket sync
- Built-in plugins: Weather forecast, GitHub stats, Quote of the Day, Crypto prices
- Multi-board support — run multiple independent displays from one server
- Fullscreen TV mode with automatic tile resizing
- Keyboard controls for manual navigation
- Emoji support in messages (animate through random charset characters before landing)
- Responsive from mobile to 4K displays
- Pure vanilla HTML/CSS/JS frontend — no frameworks, no build tools, no npm

## Deployment Options

FlipOff can run in three ways. Choose the one that fits your needs:

| | GitHub Pages | Static Server | Docker / Backend |
|---|---|---|---|
| **Setup** | Fork + enable Pages | `python3 -m http.server` | `docker compose up --build` |
| **Display + animations** | Yes | Yes | Yes |
| **Sound modes** | Yes | Yes | Yes |
| **Dynamic date/time + weather** | Yes | Yes | Yes |
| **Keyboard shortcuts** | Yes | Yes | Yes |
| **Control panel (same-browser)** | Yes | Yes | Yes |
| **Emoji + colored rows** | Yes | Yes | Yes |
| **config.json customization** | Yes (edit before deploy) | Yes | Yes (live reload on restart) |
| **Admin dashboard** | No | No | Yes |
| **Server-side plugins** | No | No | Yes |
| **REST API / WebSocket** | No | No | Yes |
| **Multi-board support** | No | No | Yes |
| **Remote control (other devices)** | No | No | Yes |

### Option 1: GitHub Pages (easiest, free hosting)

Deploy to GitHub Pages for a zero-maintenance public display:

1. **Fork this repository** on GitHub
2. Go to your fork's **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. Push any change to `main` (or go to **Actions → Deploy to GitHub Pages → Run workflow**)
5. Your display will be live at `https://<your-username>.github.io/flipoff/`

To customize messages, edit `config.json` in your fork and push — GitHub Actions will redeploy automatically.

Everything runs in the browser. No server needed. Dynamic date/time and weather work because they use client-side APIs (the browser's clock and free public APIs for geolocation + weather).

### Option 2: Static file server (local network)

Run on a local machine or Raspberry Pi to display on a TV:

```bash
git clone https://github.com/<your-username>/flipoff.git
cd flipoff
python3 -m http.server 8080
# Open http://localhost:8080
```

Same features as GitHub Pages, but you can edit `config.json` and refresh the browser to see changes immediately. Good for a home display or office TV.

Any static file server works — nginx, Apache, `npx serve`, etc.

### Option 3: Docker / Python backend (full features)

Run the full backend for admin dashboard, plugins, multi-board, and remote control:

```bash
git clone https://github.com/<your-username>/flipoff.git
cd flipoff

# With Docker (recommended):
docker compose up --build

# Or without Docker:
pip install -r requirements.txt
python server.py
```

| URL | What |
|-----|------|
| `http://localhost:8080` | Display |
| `http://localhost:8080/control.html` | Control panel (same-browser tab-to-tab) |
| `http://localhost:8080/admin` | Admin dashboard (network-wide, password-protected) |
| `http://localhost:8080/display.html` | Standalone fullscreen display (no header/hero) |

The admin password is auto-generated on first run and printed to the console. Set it explicitly with the `ADMIN_PASSWORD` environment variable.

Board config and screens persist in a Docker volume (`flipoff-data`). Message changes in `config.json` are picked up automatically on restart — no need to reset the volume.

## Dynamic Messages

Add dynamic messages to `config.json` alongside regular quotes:

```json
{
  "messages": [
    {"dynamic": "datetime"},
    {"dynamic": "weather"},
    ["", "🏛️ GOD IS IN", "THE DETAILS .", "(LUDWIG MIES)", ""]
  ]
}
```

| Type | What it shows | Color |
|------|--------------|-------|
| `datetime` | 🕐 Time, day of week, 📅 date, timezone (e.g. `GMT+1`) | Airport-board yellow |
| `weather` | City, 🇵🇹 country flag + name, temperature, condition | Temperature gradient (blue at -10C → red at 40C) |

- **Date/time** always shows first, **weather** second, then all messages rotate randomly
- Weather is auto-detected from IP geolocation (no API key needed) using Open-Meteo
- Weather data refreshes every 10 minutes in the background
- Both dynamic messages work on all deployment options (GitHub Pages, static server, Docker)

## Control Panel vs Admin Dashboard

| | Control Panel | Admin Dashboard |
|---|---|---|
| **How it works** | BroadcastChannel (tab-to-tab) | REST API + WebSocket |
| **Requires backend** | No | Yes (`python server.py`) |
| **Reach** | Same browser only | Any device on the network |
| **Auth** | None | Password |
| **Features** | Custom message, clock, countdown, message queue | Board config, screen management, plugins, message override |

Both are accessible from the display page header. The Admin button only appears when the backend is detected.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` / `Space` | Next message |
| `Arrow Left` | Previous message |
| `Arrow Right` | Next message |
| `F` | Toggle fullscreen |
| `M` | Cycle sound mode (Authentic / Soft / Joke / Mute) |
| `R` | Toggle random message order |
| `C` | Cycle display mode (Color / Matrix / Grayscale) |
| `Escape` | Exit fullscreen |

## How It Works

Each tile on the board is an independent split-flap element with top/bottom halves that animate through an ordered character-stepping sequence — just like a real mechanical board. Only tiles whose content changes between messages animate. Emojis are supported: tiles flip through random charset characters before snapping to the final emoji.

Sound is generated per-tile using extracted tick slices from a recorded split-flap audio clip, with stereo panning based on tile position. A master audio chain applies lowpass filtering, EQ, and compression across four sound profiles. Authentic mode is the default.

Dynamic messages (date/time, weather) support per-row coloring — airport-board yellow for date/time, and a temperature-based gradient (blue→cyan→green→yellow→orange→red) for weather. Colors are applied after the flip animation completes and cleared when a regular message displays.

## File Structure

```
flipoff/
  index.html              — Main display page
  display.html            — Standalone fullscreen display (no chrome)
  control.html            — Browser-based control panel
  admin.html              — Admin dashboard (server-side)
  config.json             — Configuration (grid, timing, messages, colors)
  server.py               — Python backend (aiohttp) with API, WebSocket, plugins
  requirements.txt        — Python dependencies
  Dockerfile              — Container image (runs server.py)
  docker-compose.yml      — Docker Compose with persistent volume
  PLUGINS.md              — Plugin development guide
  css/
    reset.css             — CSS reset
    layout.css            — Page layout, nav buttons, countdown bar, fullscreen
    board.css             — Board container, accent bars, shortcuts overlay
    tile.css              — Split-flap tile halves and flip animations
    responsive.css        — Media queries (mobile through 4K)
    control.css           — Control panel dark theme
    admin.css             — Admin dashboard styles
  js/
    main.js               — Entry point, audio init, fullscreen, remote sync
    Board.js              — Tile grid, display modes, row colors, transitions
    Tile.js               — Split-flap flip with character stepping and emoji support
    SoundEngine.js        — Sound profiles, tick extraction, stereo panning
    MessageRotator.js     — Shuffle, pinned start order, random mode, remote override
    KeyboardController.js — Keyboard shortcuts (F, M, R, C, arrows, etc.)
    DynamicMessages.js    — Date/time and weather providers with colored output
    ControlChannel.js     — BroadcastChannel wrapper for control panel
    boardFormatter.js     — Text wrapping and centering for the board grid
    RemoteMessageSync.js  — REST + WebSocket sync with the backend
    control.js            — Control panel logic (custom, clock, countdown, queue)
    admin.js              — Admin dashboard UI
    constants.js          — Config loader (reads config.json, exports defaults)
    flapAudio.js          — Embedded base64 audio clip
  ass-ets/audio/
    farrrt.wav            — Joke mode: fart finisher
    mixkit-rubber-duck-squeak-1014.wav — Joke mode: rubber duck squeak
  plugins/
    base.py               — ScreenPlugin base class and types
    __init__.py            — Plugin discovery and loader
    weather/              — Open-Meteo 3-day forecast
    github/               — Repo stats, open issues/PRs
    api_ninjas/           — Quote of the Day, random quotes, crypto prices
  tests/                  — Backend, plugin, and config.json test suite
  .github/workflows/
    deploy.yml            — GitHub Pages deployment
```

## Customization

Edit `config.json` to change:
- **Messages**: Static quotes (5-line arrays) and dynamic markers (`{"dynamic": "datetime"}`, `{"dynamic": "weather"}`)
- **Grid size**: `grid.cols` and `grid.rows`
- **Timing**: `timing.flipStepDuration`, `timing.staggerDelay`, `timing.messageInterval`, etc.
- **Colors**: `accentColors` array
- **Character set**: `charset` string (includes A-Z, 0-9, punctuation, parentheses)

Message changes in `config.json` take effect on restart — no need to reset Docker volumes or clear state.

When running with the backend, board config can also be changed at runtime through the admin dashboard.

## Environment Variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server listen port |
| `ADMIN_PASSWORD` | Auto-generated | Admin dashboard password |
| `API_NINJAS_API_KEY` | — | API key for quote and crypto price plugins |

## License

MIT — do whatever you want with it.
