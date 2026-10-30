// Tracks which keys are held and how far the mouse was dragged since the last frame.
export class Input {
  constructor(element) {
    this.keys = new Set();
    this.dragX = 0;
    this.dragY = 0;
    this.jumpPressed = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        if (!e.repeat) this.jumpPressed = true;
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    let dragging = false;
    element.addEventListener('pointerdown', (e) => {
      dragging = true;
      element.setPointerCapture(e.pointerId);
    });
    element.addEventListener('pointerup', () => (dragging = false));
    element.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.dragX += e.movementX;
      this.dragY += e.movementY;
    });
  }

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  // Movement as x (right) / z (forward) in the range -1..1.
  moveAxis() {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const z = (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    return { x, z };
  }

  // Call once per frame after reading input.
  endFrame() {
    this.dragX = 0;
    this.dragY = 0;
    this.jumpPressed = false;
  }
}
