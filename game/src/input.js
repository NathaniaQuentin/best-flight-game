// Keyboard and mouse input for Meridian Airlift.
// Arrows/WASD pitch and bank, W/S or Shift throttle, mouse steers, P pause,
// M mute, R restart, Enter confirms. Exposes a plain input state each frame.

export function createInput() {
  const keys = new Set();
  const state = {
    pitch: 0, // -1..1, up positive
    bank: 0, // -1..1, right positive
    throttle: 0, // -1..1
    boost: false,
    mouseX: 0, // -1..1 from screen centre
    mouseY: 0,
    mouseActive: false,
    pressed: new Set(), // keys pressed since last poll, for menus
  };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat) state.pressed.add(e.key);
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function onKeyUp(e) {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function onMouseMove(e) {
    const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: 0, top: 0, width: 1280, height: 480 };
    state.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    state.mouseActive = true;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);

  /** Read the current stick position from keys and mouse. */
  function poll() {
    let pitch = 0;
    let bank = 0;
    let throttle = 0;
    if (keys.has('ArrowUp') || keys.has('w')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('s')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('a')) bank -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) bank += 1;
    if (keys.has('Shift')) throttle += 1;
    if (keys.has('Control')) throttle -= 1;
    // Mouse steers when it is off-centre and no arrow keys are held.
    if (state.mouseActive && bank === 0 && pitch === 0) {
      if (Math.abs(state.mouseX) > 0.08) bank = Math.max(-1, Math.min(1, state.mouseX * 1.4));
      if (Math.abs(state.mouseY) > 0.08) pitch = Math.max(-1, Math.min(1, -state.mouseY * 1.2));
    }
    state.pitch = pitch;
    state.bank = bank;
    state.throttle = throttle;
    state.boost = keys.has(' ');
    const pressed = new Set(state.pressed);
    state.pressed.clear();
    return { ...state, pressed };
  }

  return { state, poll };
}
