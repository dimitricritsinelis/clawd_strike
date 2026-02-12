import { Client } from "colyseus.js";
import type { Room } from "colyseus.js";

import { dust2Slice } from "@clawd-strike/shared";
import type { KillMsg, SnapshotMsg } from "@clawd-strike/shared";
import { DT, TICK_RATE } from "@clawd-strike/engine";

import { Game } from "./runtime/Game";
import { LoadingAmbientAudio } from "./runtime/audio/LoadingAmbientAudio";

const canvasEl = document.querySelector<HTMLCanvasElement>("#c");
const startEl = document.querySelector<HTMLDivElement>("#start");
const muteToggleBtnEl = document.querySelector<HTMLButtonElement>("#mute-toggle-btn");
const singlePlayerBtnEl = document.querySelector<HTMLButtonElement>("#single-player-btn");
const multiPlayerBtnEl = document.querySelector<HTMLButtonElement>("#multi-player-btn");
const modeBannerEl = document.querySelector<HTMLDivElement>("#mode-banner");
const statusEl = document.querySelector<HTMLDivElement>("#status");
const feedEl = document.querySelector<HTMLDivElement>("#feed");

if (!canvasEl || !startEl || !muteToggleBtnEl || !singlePlayerBtnEl || !multiPlayerBtnEl || !modeBannerEl || !statusEl || !feedEl) {
  throw new Error("Missing required DOM elements.");
}

function resolveHighQualityMode(): boolean {
  const query = new URLSearchParams(window.location.search).get("quality");
  return query === "high";
}

const client = new Client("ws://localhost:2567");
const isVirtualTime = typeof window.__vt_pending !== "undefined";
const highQualityMode = resolveHighQualityMode();

const canvas = canvasEl;
const start = startEl;
const muteToggleBtn = muteToggleBtnEl;
const singlePlayerBtn = singlePlayerBtnEl;
const multiPlayerBtn = multiPlayerBtnEl;
const modeBanner = modeBannerEl;
const status = statusEl;
const feed = feedEl;

const loadingAmbient = new LoadingAmbientAudio({
  src: "/loading-screen/ClawdStriker_Audio.mp3",
  playFromSec: 0,
  loopStartSec: 0,
  loopEndSec: Number.POSITIVE_INFINITY,
  crossfadeSec: 0.22,
  gain: 0.45,
});

let game: Game | null = null;
let room: Room | null = null;
let gameStarted = false;
let bannerTimer: number | null = null;
let disposed = false;
let loopStarted = false;
let loopLastMs = performance.now();
let loopAccumulator = 0;

// Hide gameplay HUD status while the loading/menu screen is visible.
status.style.display = "none";
loadingAmbient.setMuted(false);

function ensureGame(): Game {
  if (game) return game;
  game = new Game({
    canvas,
    map: dust2Slice,
    statusEl: status,
    feedEl: feed,
    highQuality: highQualityMode,
  });
  return game;
}

function syncMuteButtonState() {
  const muted = loadingAmbient.isMuted();
  muteToggleBtn.classList.toggle("is-muted", muted);
  muteToggleBtn.classList.toggle("is-unmuted", !muted);
  muteToggleBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  muteToggleBtn.setAttribute("aria-label", muted ? "Unmute loading ambience" : "Mute loading ambience");
}

function flashMuteButton() {
  muteToggleBtn.classList.remove("flash");
  void muteToggleBtn.offsetWidth;
  muteToggleBtn.classList.add("flash");
}

async function connect() {
  if (room || disposed) return;
  const joinedRoom = await client.joinOrCreate("fps");
  if (disposed) {
    void joinedRoom.leave().catch(() => {
      // Best-effort teardown on race with unload.
    });
    return;
  }
  room = joinedRoom;
  room.onMessage("snapshot", (msg: SnapshotMsg) => {
    game?.onSnapshot(msg);
  });
  room.onMessage("kill", (msg: KillMsg) => {
    game?.onKill(msg);
  });
  ensureGame().setSendInput((input) => {
    room?.send("input", input);
  });
}

function requestPointerLock() {
  if (typeof canvas.requestPointerLock !== "function") return;
  if (document.pointerLockElement !== canvas) {
    void canvas.requestPointerLock();
  }
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === canvas;
  if (!gameStarted) start.style.display = locked ? "none" : "grid";
  game?.setPointerLocked(locked);
}

document.addEventListener("pointerlockchange", onPointerLockChange);

function warmupLoadingAmbientAudio() {
  if (gameStarted || disposed) return;
  void loadingAmbient.start();
}

start.addEventListener("pointerdown", warmupLoadingAmbientAudio, { passive: true });
window.addEventListener("keydown", warmupLoadingAmbientAudio);
syncMuteButtonState();
void loadingAmbient.start();

function frame(now: number) {
  if (!loopStarted || disposed) return;
  const runtimeGame = game;
  if (!runtimeGame) {
    requestAnimationFrame(frame);
    return;
  }

  const dtMs = now - loopLastMs;
  loopLastMs = now;
  loopAccumulator += dtMs / 1000;

  const maxSteps = 5;
  let steps = 0;
  while (loopAccumulator >= DT && steps < maxSteps) {
    runtimeGame.step(DT);
    loopAccumulator -= DT;
    steps++;
  }

  runtimeGame.render();
  requestAnimationFrame(frame);
}

function startRuntimeLoop() {
  if (loopStarted || isVirtualTime) return;
  loopStarted = true;
  loopLastMs = performance.now();
  loopAccumulator = 0;
  requestAnimationFrame(frame);
}

function startGame(showMultiplayerWarning: boolean) {
  if (disposed || gameStarted) return;
  const runtimeGame = ensureGame();

  gameStarted = true;
  loadingAmbient.stop();
  start.style.display = "none";
  status.style.display = "block";
  start.removeEventListener("pointerdown", warmupLoadingAmbientAudio);
  window.removeEventListener("keydown", warmupLoadingAmbientAudio);

  if (showMultiplayerWarning) {
    modeBanner.classList.add("show");
    if (bannerTimer !== null) window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      modeBanner.classList.remove("show");
      bannerTimer = null;
    }, 3200);
  }

  if (isVirtualTime) {
    runtimeGame.setPointerLocked(true);
    runtimeGame.render();
  } else {
    requestPointerLock();
    startRuntimeLoop();
  }

  void connect();
}

function onSinglePlayerClick() {
  startGame(false);
}

function onMultiPlayerClick() {
  startGame(true);
}

function onMuteToggleClick() {
  if (disposed || gameStarted) return;
  const nextMuted = !loadingAmbient.isMuted();
  loadingAmbient.setMuted(nextMuted);
  if (!nextMuted) {
    void loadingAmbient.start();
  }
  syncMuteButtonState();
  flashMuteButton();
}

muteToggleBtn.addEventListener("click", onMuteToggleClick);
singlePlayerBtn.addEventListener("click", onSinglePlayerClick);
multiPlayerBtn.addEventListener("click", onMultiPlayerClick);

function teardown() {
  if (disposed) return;
  disposed = true;
  loopStarted = false;

  if (bannerTimer !== null) {
    window.clearTimeout(bannerTimer);
    bannerTimer = null;
  }

  document.removeEventListener("pointerlockchange", onPointerLockChange);
  start.removeEventListener("pointerdown", warmupLoadingAmbientAudio);
  window.removeEventListener("keydown", warmupLoadingAmbientAudio);
  muteToggleBtn.removeEventListener("click", onMuteToggleClick);
  singlePlayerBtn.removeEventListener("click", onSinglePlayerClick);
  multiPlayerBtn.removeEventListener("click", onMultiPlayerClick);

  loadingAmbient.stop();
  game?.dispose();
  game = null;

  if (room) {
    const activeRoom = room;
    room = null;
    void activeRoom.leave().catch(() => {
      // Socket may already be closed during unload.
    });
  }
}

window.addEventListener("pagehide", teardown);
window.addEventListener("beforeunload", teardown);

// Deterministic stepping hook for Playwright.
if (isVirtualTime) {
  window.advanceTime = async (ms: number) => {
    if (disposed) return;
    const runtimeGame = game;
    if (!runtimeGame) return;

    const steps = Math.max(1, Math.round(ms / (1000 / TICK_RATE)));
    for (let i = 0; i < steps; i++) runtimeGame.step(DT);
    runtimeGame.render();
  };
}

// Required by the develop-web-game skill for automated inspection.
window.render_game_to_text = () => {
  if (game) return game.renderGameToText();

  return JSON.stringify({
    coordinate_system: {
      origin: "map center at (0,0,0)",
      axes: "x right/left, y up, z forward/back",
    },
    mode: "menu",
    fallbackMode: false,
    render: {
      drawCalls: 0,
      triangles: 0,
      materials: 0,
      quality: highQualityMode ? "high" : "low",
    },
    serverTick: 0,
    player: {
      id: null,
      team: "T",
      alive: true,
      hp: 100,
      ammo: 30,
      pos: { x: -40, y: 0, z: -16 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
    },
    teams: {
      score: { T: 0, CT: 0 },
      alive: { T: 0, CT: 0 },
    },
    entities: [],
  });
};
