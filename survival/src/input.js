// Tracks which keys are held, which were just pressed, the mouse button, and how far
// the mouse wheel scrolled since the last frame.
export class Input {
  constructor(element) {
    this.keys = new Set();
    this.pressed = new Set();
    this.scroll = 0;
    this.mouseDown = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    element.addEventListener('pointerdown', (e) => {
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

  // Holding Space or the left mouse button uses whatever is in your hand.
  usingTool() {
    return this.mouseDown || this.isDown('Space');
  }

  // True only on the frame Space or the left mouse button went down.
  startedUsingTool() {
    return this.wasPressed('MouseLeft') || this.wasPressed('Space');
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
