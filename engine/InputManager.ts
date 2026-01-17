
export class InputManager {
  private keys: Set<string> = new Set();

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  public getMovement(playerIndex: number): { x: number; y: number } {
    let dx = 0;
    let dy = 0;

    if (playerIndex === 0) {
      if (this.keys.has('KeyW')) dy -= 1;
      if (this.keys.has('KeyS')) dy += 1;
      if (this.keys.has('KeyA')) dx -= 1;
      if (this.keys.has('KeyD')) dx += 1;
    }

    if (playerIndex === 1) {
      if (this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('ArrowDown')) dy += 1;
      if (this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('ArrowRight')) dx += 1;
    }

    const gp = navigator.getGamepads()[playerIndex];
    if (gp) {
      const threshold = 0.15;
      const lx = gp.axes[0];
      const ly = gp.axes[1];
      if (Math.abs(lx) > threshold || Math.abs(ly) > threshold) {
        dx = lx; dy = ly;
      }
    }

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    return { x: dx, y: dy };
  }

  public isMagicFirePressed(playerIndex: number): boolean {
    if (playerIndex === 0 && this.keys.has('KeyE')) return true;
    if (playerIndex === 1 && this.keys.has('Digit0')) return true;
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) return gp.buttons[7].pressed; // R2
    return false;
  }

  public isJumpPressed(playerIndex: number): boolean {
    if (playerIndex === 0 && this.keys.has('Space')) return true;
    if (playerIndex === 1 && this.keys.has('ControlRight')) return true;
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) return gp.buttons[0].pressed; // A
    return false;
  }

  public isBlockPressed(playerIndex: number): boolean {
    if (playerIndex === 0 && this.keys.has('ShiftLeft')) return true;
    if (playerIndex === 1 && this.keys.has('ShiftRight')) return true;
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) return gp.buttons[6].pressed; // L2
    return false;
  }

  public isRevivePressed(playerIndex: number): boolean {
    if (playerIndex === 0 && this.keys.has('KeyR')) return true;
    if (playerIndex === 1 && this.keys.has('Enter')) return true;
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) return gp.buttons[2].pressed; // X
    return false;
  }

  public isMeleePressed(playerIndex: number): boolean {
    if (playerIndex === 0 && this.keys.has('KeyF')) return true;
    if (playerIndex === 1 && this.keys.has('Period')) return true;
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) return gp.buttons[1].pressed || gp.buttons[5].pressed; // B / R1
    return false;
  }

  public isLimitBreakPressed(playerIndex: number): boolean {
    if (playerIndex === 0 && this.keys.has('KeyQ')) return true;
    if (playerIndex === 1 && this.keys.has('Numpad0')) return true;
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) return gp.buttons[10].pressed || gp.buttons[11].pressed; // L3/R3
    return false;
  }

  public isSkillPressed(playerIndex: number, skillIndex: number): boolean {
    const keys = [
      ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
      ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4']
    ];
    if (this.keys.has(keys[playerIndex][skillIndex])) return true;
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) {
        if (skillIndex === 0) return gp.buttons[2].pressed; // X / Square
        if (skillIndex === 1) return gp.buttons[3].pressed; // Y / Triangle
        if (skillIndex === 2) return gp.buttons[1].pressed; // B / Circle
        if (skillIndex === 3) return gp.buttons[0].pressed; // A / Cross
    }
    return false;
  }

  public getAim(playerIndex: number): { x: number; y: number } | null {
    const gp = navigator.getGamepads()[playerIndex];
    if (gp) {
      const threshold = 0.2;
      const rx = gp.axes[2];
      const ry = gp.axes[3];
      if (Math.abs(rx) > threshold || Math.abs(ry) > threshold) return { x: rx, y: ry };
    }
    return null;
  }
}
