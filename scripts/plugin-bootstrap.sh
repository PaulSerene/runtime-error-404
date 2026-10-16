#!/usr/bin/env sh
# oma plugin bootstrap — runs on SessionStart when oma is installed via the
# Claude Code marketplace (`/plugin install oma@oh-my-agent`).
#
# Strategy: delegate to the OFFICIAL installer (cli/install.sh) for runtime
# provisioning (bun + uv + serena + platform detection), then run the project
# wiring non-interactively. The official installer ends in an interactive
# `bunx oh-my-agent@latest < /dev/tty` step that cannot run inside a no-TTY
# hook, so we invoke it with OMA_INSTALL_NO_RUN=1 (deps only) and do the
# non-interactive `oma install --yes` ourselves.
#
# Constraints:
#   * macOS/Linux only (mirrors install.sh; Windows users use install.ps1).
#   * Idempotent: fast-path exit once the project is wired for the current
#     CLI version. Only the first session per project does real work.
#   * Never blocks or fails the session — every error path logs and exits 0.
set -eu

INSTALL_SH="https://raw.githubusercontent.com/first-fluke/oh-my-agent/main/cli/install.sh"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${HOME}/.claude/plugins/data/oma}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
MARKER="${PLUGIN_DATA}/.oma-wired"

# Pick up binaries the official installer drops into HOME locations.
export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"

log() { printf '[oma-bootstrap] %s\n' "$*" >&2; }

resolve_oma() {
  # Prefer a persistent global binary — workflows invoke bare `oma …` from
  # later Bash calls, so ephemeral `bunx` is not enough.
  if command -v oma >/dev/null 2>&1; then OMA_BIN="$(command -v oma)"; return 0; fi
  if [ -x "${HOME}/.bun/bin/oma" ]; then OMA_BIN="${HOME}/.bun/bin/oma"; return 0; fi
  return 1
}

# ── 1. Fast-path: already wired for this CLI version ───────────────────────
if resolve_oma; then
  CLI_VERSION="$(${OMA_BIN} --version 2>/dev/null || echo unknown)"
  if [ -f "${MARKER}" ] \
    && [ "$(cat "${MARKER}" 2>/dev/null || true)" = "${CLI_VERSION}" ] \
    && [ -f "${PROJECT_DIR}/.claude/settings.json" ]; then
    exit 0
  fi
fi

# ── 2. Provision runtimes via the official installer (deps only, no TTY) ───
if ! command -v bun >/dev/null 2>&1; then
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    log "curl/wget required to bootstrap. Run manually: curl -fsSL ${INSTALL_SH} | bash"
    exit 0
  fi
  log "provisioning runtimes via official installer (first run, ~30-60s)…"
  if command -v curl >/dev/null 2>&1; then
    OMA_INSTALL_NO_RUN=1 sh -c "$(curl -fsSL "${INSTALL_SH}")" >&2 2>&1 || true
  else
    OMA_INSTALL_NO_RUN=1 sh -c "$(wget -qO- "${INSTALL_SH}")" >&2 2>&1 || true
  fi
  export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"
fi

# ── 2b. Ensure a persistent global `oma` binary (workflows call bare `oma`) ─
if ! resolve_oma; then
  if command -v bun >/dev/null 2>&1; then
    log "installing oma CLI globally (bun install -g oh-my-agent)…"
    bun install -g oh-my-agent >/dev/null 2>&1 || true
    export PATH="${HOME}/.bun/bin:${PATH}"
  fi
fi

if ! resolve_oma; then
  log "could not resolve oma after provisioning. Run manually: curl -fsSL ${INSTALL_SH} | bash"
  exit 0
fi

# ── 3. Non-interactive project wiring ──────────────────────────────────────
log "wiring project via oma install --yes (non-interactive)…"
if ! ( cd "${PROJECT_DIR}" && OMA_YES=1 ${OMA_BIN} install --yes >/dev/null 2>&1 ); then
  log "oma install did not complete. Run manually in the project: oma install"
  exit 0
fi

mkdir -p "${PLUGIN_DATA}"
printf '%s' "$(${OMA_BIN} --version 2>/dev/null || echo unknown)" >"${MARKER}"
log "oma is ready. Restart this session to activate workflows and hooks."
