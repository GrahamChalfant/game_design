// Tracks which keys are held, which were just pressed, the mouse button and where the mouse
// is, and how far the mouse wheel scrolled since the last frame.
export class Input {
  constructor(element) {
    this.keys = new Set();
    this.pressed = new Set();
    this.scroll = 0;
    this.mouseDown = false;
    this.pointer = { x: 0, y: 0 }; // the mouse, in pixels from the top left of the window

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    this.pointer = { x: 0, y: 0 }; // the mouse, in pixels from the top left of the window
    });
    const track = (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    };
    element.addEventListener('pointermove', track);
    element.addEventListener('pointerdown', (e) => {
      track(e);
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.pressed.add('MouseLeft');
    });
    window.addEventListener('pointerup', () => (this.mouseDown = false));
    element.addEventListener(
      'wheel',
      (e) => {
        this.scroll += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
  }

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  // True only on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Holding the left mouse button uses whatever is in your hand. (Space is jump.)
  usingTool() {
    return this.mouseDown;
  }

  // True only on the frame the left mouse button went down.
  startedUsingTool() {
    return this.wasPressed('MouseLeft');
  }

  // Movement on the ground: x is east (right on screen), z is south (down on screen). Range -1..1.
  moveAxis() {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const z = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    return { x, z };
  }

  // Call once per frame after reading input.
  endFrame() {
    this.scroll = 0;
    this.pressed.clear();
  }
}
