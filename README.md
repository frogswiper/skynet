# SKYNET // Ollama operator terminal

A 1984 Cyberdyne-style phosphor HUD for Ollama. It runs full screen, boots on the SKYNET logo,
and talks to local or Ollama cloud models. By default it uses the newest **GLM cloud model**.

## Install on Linux / macOS (one line)

```bash
curl -fsSL https://raw.githubusercontent.com/frogswiper/skynet/main/install.sh | bash
```

The installer:

1. installs **Ollama** if it isn't present (official `ollama.com` installer)
2. starts the Ollama server if it isn't running
3. runs `ollama signin`. If a link is shown, open it, approve, and the install continues
4. finds the **newest GLM cloud model** on ollama.com (currently `glm-5.3:cloud`) and pulls it
5. uses the system Node.js 18+ if there is one; otherwise it downloads a checksum-verified Node 22
   into `~/.local/share/skynet/node` (no sudo)
6. installs SKYNET to `~/.local/share/skynet/app`, adds the `skynet` command and a menu entry, then launches it

Options (set before `bash`, e.g. `curl … | SKYNET_MODEL=glm-5.2:cloud bash`):

| variable | default | |
|---|---|---|
| `SKYNET_MODEL` | newest `glm-*:cloud` | model to pull and select at start |
| `SKYNET_PORT` | `8484` | local web port (bound to 127.0.0.1 only) |
| `SKYNET_NO_LAUNCH` | — | set to `1` to skip launching at the end |

Settings are saved in `~/.config/skynet/skynet.env`. Run the one-liner again to update.

## Install on Windows 10 / 11

Open **PowerShell** (a normal window, not as administrator) and run:

```powershell
irm https://raw.githubusercontent.com/frogswiper/skynet/main/install.ps1 | iex
```

The Windows installer:

1. installs **Ollama** if it isn't present (winget, or the official `OllamaSetup.exe`)
2. starts the Ollama server if it isn't running
3. runs `ollama signin`. If a link is shown, open it, approve, and the install continues
4. finds the **newest GLM cloud model** on ollama.com and pulls it
5. uses Node.js 18+ if it is installed; otherwise it downloads a checksum-verified Node 22
   into `%LOCALAPPDATA%\skynet\node` (no admin)
6. installs SKYNET to `%LOCALAPPDATA%\skynet\app`, saves settings to `%APPDATA%\skynet\skynet.env`, adds
   **Start Menu and desktop shortcuts** and the `skynet` command (new terminals), then launches it

It opens full screen in its own **Edge** kiosk window (Chrome or Brave if Edge is missing), with
autoplay allowed. Esc exits; Alt+F4 also works. Set options the same way as on Linux, e.g.
`$env:SKYNET_MODEL = 'glm-5.2:cloud'; irm … | iex`. Run the one-liner again to update.

## Run

    skynet              # starts server.js if needed and opens SKYNET full screen

`skynet` opens its own **full-screen kiosk window** with a dedicated browser profile, using Firefox or
Chromium/Chrome. Audio autoplay is allowed so the boot sounds play.
**Press Esc to exit.** It stops a running reply first; when idle it powers down SKYNET, stops the local
server and closes the window. `/exit` does the same, and Alt+F4 also works.
`SKYNET_BROWSER=default skynet` opens a normal tab in the default browser instead.

The boot plays the SKYNET logo (`public/skynet-logo.svg`), then a **surveillance trace**: an LED-bitmap
world, in the phosphor colour, zooms in on this computer until "OPERATOR LOCATED". Then the BIOS log.
Any key skips ahead.

The **ATMOSPHERIC SCAN** panel (top of the right column) shows the local weather from
[Open-Meteo](https://open-meteo.com) (no key): temperature, conditions, wind and the next six hours. Click it, or type
`/weather`, for a report; the model also gets the current weather so you can ask it.

**Where it thinks you are**: at every start it locates the computer. It uses the browser's location only when that is precise (under 5 km, e.g. Windows location services or Wi-Fi); otherwise it uses your IP address via BigDataCloud's free client API. Place names come from Open-Meteo's geocoder, so local spellings like Hønefoss survive. `/weather <place>` pins a place, and `/locate` goes back to automatic. Coordinates are sent only to BigDataCloud and Open-Meteo and are stored in the browser.

## Manual / development

    git clone https://github.com/frogswiper/skynet && cd skynet
    node server.js      # needs Node 18+, Ollama on 127.0.0.1:11434

Env vars: `SKYNET_PORT` (8484), `SKYNET_BIND` (127.0.0.1), `OLLAMA_URL` (http://127.0.0.1:11434),
`SKYNET_MODEL` (glm-5.3:cloud).

- `server.js` has no dependencies. It serves `public/` and proxies only these endpoints:
  version, tags, ps, show, chat, generate, pull. Delete/create/push are blocked.
- Mission logs, settings and history are stored in the browser's localStorage (`skynet.v1`).
- `public/worldmap.js` (Natural Earth 1:110m) and `public/detailmap.js` (1:10m inset of southern Norway) are public-domain
  map data built by `tools/build-map.py` and `tools/build-detail.py`. `public/where.js` (location, weather, boot zoom) is
  shared with [W.O.P.R.](https://github.com/frogswiper/wopr).
- Type `/help` in the terminal to see the command list. Pick any other installed model in the NET panel.

---
Fan project. Not affiliated with or endorsed by the owners of the *Terminator* franchise.
