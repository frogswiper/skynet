#!/usr/bin/env bash
# SKYNET installer
#   curl -fsSL https://raw.githubusercontent.com/frogswiper/skynet/main/install.sh | bash
#
# 1. installs Ollama if it is not present (official ollama.com installer; on a Mac: the Ollama app)
# 2. makes sure the Ollama server is running
# 3. signs in to ollama.com (needed for cloud models)
# 4. finds the newest GLM cloud model on ollama.com and pulls it (e.g. glm-5.3:cloud)
# 5. installs Node.js locally if missing/too old, downloads SKYNET, adds a launcher + menu entry
#    (on a Mac: a SKYNET app in ~/Applications, for Launchpad, Spotlight and the Dock)
# 6. starts SKYNET full screen
#
# Env overrides: SKYNET_MODEL=<name:tag>  SKYNET_PORT=8484  SKYNET_NO_LAUNCH=1  SKYNET_BRANCH=main
set -euo pipefail

REPO="frogswiper/skynet"
BRANCH="${SKYNET_BRANCH:-main}"
FALLBACK_MODEL="glm-5.3:cloud"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/skynet"
APP="$DATA/app"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/skynet"
BIN="${SKYNET_BIN:-$HOME/.local/bin}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"

red=$'\e[31m'; hi=$'\e[1;31m'; dim=$'\e[2m'; off=$'\e[0m'
say()  { printf '%s>%s %s\n' "$hi" "$off" "$*"; }
ok()   { printf '  %s... OK%s %s\n' "$red" "$off" "$*"; }
die()  { printf '%sERROR:%s %s\n' "$hi" "$off" "$*" >&2; exit 1; }

# Interactive steps (ollama signin, sudo) need the terminal even when piped from curl.
TTY=/dev/tty; { : < /dev/tty; } 2>/dev/null || TTY=/dev/null

printf '%s' "$red"
cat <<'BANNER'
   ____  _  ____   ___   _ _____ _____
  / ___|| |/ /\ \ / / \ | | ____|_   _|
  \___ \| ' /  \ V /|  \| |  _|   | |
   ___) | . \   | | | |\  | |___  | |
  |____/|_|\_\  |_| |_| \_|_____| |_|
BANNER
printf '%s  NEURAL NET-BASED ARTIFICIAL INTELLIGENCE  //  INSTALLER%s\n\n' "$dim" "$off"

[ "$(id -u)" = 0 ] && die "run as your normal user, not root (sudo is used only where needed)"
command -v curl >/dev/null || die "curl is required"
command -v tar  >/dev/null || die "tar is required"

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in Linux) os=linux ;; Darwin) os=darwin ;; *) die "unsupported OS: $OS" ;; esac
case "$ARCH" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) die "unsupported CPU: $ARCH" ;; esac

# ---------- 1. Ollama ----------
say "CHECKING OLLAMA RUNTIME"
# On a Mac the command lives inside Ollama.app; it is only on PATH if the app linked it.
mac_ollama() {
  local d; for d in /Applications "$HOME/Applications"; do
    [ -x "$d/Ollama.app/Contents/Resources/ollama" ] && { PATH="$PATH:$d/Ollama.app/Contents/Resources"; return 0; }
  done; return 1
}
if [ "$os" = darwin ] && ! command -v ollama >/dev/null; then mac_ollama || true; fi
if command -v ollama >/dev/null; then
  ok "$(ollama --version 2>/dev/null | head -1)"
else
  say "OLLAMA NOT FOUND - INSTALLING FROM ollama.com"
  oi="$(mktemp)"   # handles Linux and macOS (installs Ollama.app on a Mac)
  curl -fsSL https://ollama.com/install.sh -o "$oi"
  sh "$oi" < "$TTY"
  rm -f "$oi"
  hash -r
  if [ "$os" = darwin ] && ! command -v ollama >/dev/null; then mac_ollama || true; fi
  command -v ollama >/dev/null || die "Ollama install failed"
  ok "$(ollama --version 2>/dev/null | head -1)"
fi

# ---------- 2. Ollama server ----------
say "ESTABLISHING UPLINK TO $OLLAMA_URL"
if ! curl -fs -o /dev/null "$OLLAMA_URL/api/version"; then
  if command -v systemctl >/dev/null && systemctl list-unit-files ollama.service >/dev/null 2>&1; then
    sudo systemctl start ollama < "$TTY" || true
  fi
  if [ "$os" = darwin ]; then open -g -a Ollama --args hidden >/dev/null 2>&1 || true; sleep 1; fi
  if ! curl -fs -o /dev/null "$OLLAMA_URL/api/version"; then
    mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"
    nohup ollama serve > "${XDG_CACHE_HOME:-$HOME/.cache}/ollama-serve.log" 2>&1 &
  fi
  for _ in $(seq 100); do curl -fs -o /dev/null "$OLLAMA_URL/api/version" && break; sleep 0.2; done
fi
curl -fs -o /dev/null "$OLLAMA_URL/api/version" || die "Ollama server is not answering on $OLLAMA_URL"
ok "ONLINE"

# ---------- 3. Sign in ----------
say "AUTHENTICATING WITH ollama.com (cloud models need an account)"
printf '  %sIf a link is shown, open it in a browser, approve, and this continues.%s\n' "$dim" "$off"
ollama signin < "$TTY" || die "ollama signin failed - run 'ollama signin' and re-run this installer"
ok "SIGNED IN"

# ---------- 4. Newest GLM cloud model ----------
say "LOCATING NEWEST GLM CLOUD MODULE"
if [ -n "${SKYNET_MODEL:-}" ]; then
  MODEL="$SKYNET_MODEL"
else
  latest="$(curl -fsSL "https://ollama.com/search?c=cloud&q=glm" 2>/dev/null \
    | grep -oE 'href="/library/glm-[0-9]+(\.[0-9]+)*"' \
    | sed -E 's#.*/library/glm-##; s/"$//' | sort -u | sort -t. -k1,1n -k2,2n -k3,3n | tail -1 || true)"
  latest="${latest:+glm-$latest}"
  MODEL="${latest:+$latest:cloud}"
  MODEL="${MODEL:-$FALLBACK_MODEL}"
fi
ok "$MODEL"
say "PULLING $MODEL"
if ! ollama pull "$MODEL" < /dev/null; then
  [ "$MODEL" = "$FALLBACK_MODEL" ] && die "could not pull $MODEL"
  say "PULL FAILED - FALLING BACK TO $FALLBACK_MODEL"
  MODEL="$FALLBACK_MODEL"
  ollama pull "$MODEL" < /dev/null || die "could not pull $MODEL"
fi
ok "MODULE READY"

# ---------- 5. Node.js ----------
say "CHECKING NODE.JS (18+)"
NODE_BIN=""
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]; then
  NODE_BIN="$(command -v node)"
  ok "system node $(node --version)"
else
  base="https://nodejs.org/dist/latest-v22.x"
  file="$(curl -fsSL "$base/SHASUMS256.txt" | awk -v p="-$os-$arch.tar.gz" '$2 ~ p"$" {print $2; exit}')"
  [ -n "$file" ] || die "could not find a Node.js build for $os-$arch"
  sum="$(curl -fsSL "$base/SHASUMS256.txt" | awk -v f="$file" '$2==f {print $1}')"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  say "DOWNLOADING $file"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  if command -v sha256sum >/dev/null; then got="$(sha256sum "$tmp/$file" | cut -d' ' -f1)"
  else got="$(shasum -a 256 "$tmp/$file" | cut -d' ' -f1)"; fi
  [ "$got" = "$sum" ] || die "Node.js checksum mismatch"
  rm -rf "$DATA/node"; mkdir -p "$DATA/node"
  tar -xzf "$tmp/$file" -C "$DATA/node" --strip-components=1
  NODE_BIN="$DATA/node/bin/node"
  ok "private node $("$NODE_BIN" --version) in $DATA/node"
fi

# ---------- 6. SKYNET ----------
say "DOWNLOADING SKYNET ($REPO@$BRANCH)"
# Install an exact commit and remember it, so updates can tell what is installed.
SHA="$(curl -fsSL --max-time 20 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null || true)"
printf '%s' "$SHA" | grep -qE '^[0-9a-f]{40}$' || SHA=""
tmpapp="$(mktemp -d)"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/${SHA:-refs/heads/$BRANCH}" | tar -xz --strip-components=1 -C "$tmpapp"
[ -f "$tmpapp/server.js" ] || die "download did not contain server.js"
echo "${SHA:-unknown}" > "$tmpapp/.version"
rm -rf "$APP" "$DATA/staged"; mkdir -p "$DATA"; mv "$tmpapp" "$APP"; chmod +x "$APP/skynet" "$APP/update.sh"
ok "$APP (version ${SHA:0:7})"

mkdir -p "$CONF_DIR"
# Settings this installer does not manage (e.g. SKYNET_BROWSER=chrome) are kept.
KEEP="$(grep -vE '^(#|SKYNET_MODEL=|SKYNET_NODE=|OLLAMA_URL=|SKYNET_PORT=|SKYNET_TTS=|ESPEAK_DATA_PATH=)' "$CONF_DIR/skynet.env" 2>/dev/null | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' || true)"
{
  echo "# Written by the SKYNET installer. Edit and restart SKYNET to change."
  echo "SKYNET_MODEL=$MODEL"
  echo "SKYNET_NODE=$NODE_BIN"
  echo "OLLAMA_URL=$OLLAMA_URL"
  if [ -n "${SKYNET_PORT:-}" ]; then echo "SKYNET_PORT=$SKYNET_PORT"; fi
  if [ -n "$KEEP" ]; then echo "$KEEP"; fi
} > "$CONF_DIR/skynet.env"
ok "config $CONF_DIR/skynet.env"

mkdir -p "$BIN"; ln -sf "$APP/skynet" "$BIN/skynet"
ok "launcher $BIN/skynet"
if [ "$os" = linux ]; then
  apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"; mkdir -p "$apps"
  cat > "$apps/skynet.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=SKYNET
Comment=Cyberdyne Systems operator terminal for Ollama
Exec=$APP/skynet
Icon=$APP/public/emblem.svg
Terminal=false
Categories=Utility;
EOF
  ok "menu entry SKYNET"
elif [ "$os" = darwin ]; then
  # A small app bundle that runs the launcher: shows up in Launchpad and Spotlight and can sit in the Dock.
  mapp="$HOME/Applications/SKYNET.app"
  rm -rf "$mapp"; mkdir -p "$mapp/Contents/MacOS" "$mapp/Contents/Resources"
  printf '#!/bin/bash\nexec "%s/skynet" "$@"\n' "$APP" > "$mapp/Contents/MacOS/skynet"
  chmod 755 "$mapp/Contents/MacOS/skynet"
  cp "$APP/public/skynet.icns" "$mapp/Contents/Resources/skynet.icns" 2>/dev/null || true
  cat > "$mapp/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>SKYNET</string>
  <key>CFBundleDisplayName</key><string>SKYNET</string>
  <key>CFBundleIdentifier</key><string>com.github.frogswiper.skynet</string>
  <key>CFBundleExecutable</key><string>skynet</string>
  <key>CFBundleIconFile</key><string>skynet</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
  <key>LSUIElement</key><true/>
</dict></plist>
EOF
  touch "$mapp"
  ok "app $mapp"
fi

# A server from a previous install may still be running with the old model; restart it.
port="${SKYNET_PORT:-8484}"
if curl -fs -o /dev/null "http://127.0.0.1:$port/skynet.json"; then
  pkill -f "$APP/server.js" 2>/dev/null || true
fi

echo
say "SKYNET INSTALLED. DEFENSE NETWORK STATUS: ONLINE"
if [ "$os" = darwin ]; then where="the SKYNET app in Launchpad"; else where="the SKYNET menu entry"; fi
printf '  start it any time with %sskynet%s (or %s). Press Esc to exit.\n' "$hi" "$off" "$where"
case ":$PATH:" in *":$BIN:"*) ;; *) printf '  %s(%s is not on your PATH - run %s/skynet)%s\n' "$dim" "$BIN" "$BIN" "$off" ;; esac

if [ -z "${SKYNET_NO_LAUNCH:-}" ]; then
  "$APP/skynet" >/dev/null 2>&1 || true
fi
