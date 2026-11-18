// input.js — keyboard and mouse state for the game. The world reads held keys
// by code each step, consumes one-shot presses (Enter, F, E…) through
// `pressed`, and aims with the mouse position in canvas pixels. Listeners are
// attached once; preventDefault is applied only to keys the game itself uses,
// so the page around the canvas keeps its normal behaviour.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyE', 'KeyP', 'KeyM', 'Enter', 'Escape',
]);

export function createInput(canvas) {
  const held = new Set();
  const pressedQueue = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) pressedQueue.add(event.code);
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** True while a key is held down. */
    down(code) {
      return held.has(code);
    },
    /** True once per physical press; reading it consumes the press. */
    pressed(code) {
      if (!pressedQueue.has(code)) return false;
      pressedQueue.delete(code);
      return true;
    },
    /** True once per mouse click; reading it consumes the click. */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
    /** Movement axes from WASD and the arrow keys: {x, y} each in -1..1. */
    axes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
  };
}
