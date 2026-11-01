# SKYNET // Ollama operator terminal

A 1984 Cyberdyne-style phosphor HUD for Ollama. It runs full screen, boots on the SKYNET logo,
and talks to local or Ollama cloud models. By default it uses the newest **GLM cloud model**.

## Install (one line)

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

## Run

    skynet              # starts server.js if needed and opens SKYNET full screen

`skynet` opens its own **full-screen kiosk window** with a dedicated browser profile, using Firefox or
Chromium/Chrome. Audio autoplay is allowed so the boot sounds play. **Exit with Alt+F4.**
`SKYNET_BROWSER=default skynet` opens a normal tab in the default browser instead.

The boot plays the SKYNET logo (`public/skynet-logo.svg`) and then the BIOS log. Any key skips ahead.

## Manual / development

    git clone https://github.com/frogswiper/skynet && cd skynet
    node server.js      # needs Node 18+, Ollama on 127.0.0.1:11434

Env vars: `SKYNET_PORT` (8484), `SKYNET_BIND` (127.0.0.1), `OLLAMA_URL` (http://127.0.0.1:11434),
`SKYNET_MODEL` (glm-5.3:cloud).

- `server.js` has no dependencies. It serves `public/` and proxies only these endpoints:
  version, tags, ps, show, chat, generate, pull. Delete/create/push are blocked.
- Mission logs, settings and history are stored in the browser's localStorage (`skynet.v1`).
- Type `/help` in the terminal to see the command list. Pick any other installed model in the NET panel.

---
Fan project. Not affiliated with or endorsed by the owners of the *Terminator* franchise.
