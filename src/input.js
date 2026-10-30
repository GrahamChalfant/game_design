// Tracks which keys are held and how far the mouse wheel scrolled since the last frame.
export class Input {
  constructor(element) {
    this.keys = new Set();
    this.scroll = 0;

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
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

  // Movement on the ground: x is east (right on screen), z is south (down on screen). Range -1..1.
  moveAxis() {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const z = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    return { x, z };
  }

  // Call once per frame after reading input.
  endFrame() {
    this.scroll = 0;
  }
}
