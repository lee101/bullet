
import { InputType } from '../types';

type PlayerInputMapping = { inputType: InputType; controllerId: number | null };
type KeyboardScheme = 'WASD' | 'ARROWS';

export class InputManager {
  private keys: Set<string> = new Set();
  private uiNavCooldown: number = 0;
  private prevButtonStates: Map<number, boolean[]> = new Map();
  private controllerCallbacks: { connected: ((idx: number) => void)[]; disconnected: ((idx: number) => void)[] } = { connected: [], disconnected: [] };
  private playerInputMap: Map<number, PlayerInputMapping> = new Map();

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('gamepadconnected', (e) => {
      this.controllerCallbacks.connected.forEach(cb => cb((e as GamepadEvent).gamepad.index));
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.controllerCallbacks.disconnected.forEach(cb => cb((e as GamepadEvent).gamepad.index));
    });
  }

  public onControllerConnected(callback: (index: number) => void): void {
    this.controllerCallbacks.connected.push(callback);
  }

  public onControllerDisconnected(callback: (index: number) => void): void {
    this.controllerCallbacks.disconnected.push(callback);
  }

  public setPlayerInputMapping(playerIndex: number, inputType: InputType, controllerId: number | null): void {
    this.playerInputMap.set(playerIndex, { inputType, controllerId });
  }

  public removePlayerInputMapping(playerIndex: number): void {
    if (!this.playerInputMap.size) return;
    const updated = new Map<number, PlayerInputMapping>();
    for (const [idx, mapping] of this.playerInputMap.entries()) {
      if (idx < playerIndex) updated.set(idx, mapping);
      else if (idx > playerIndex) updated.set(idx - 1, mapping);
    }
    this.playerInputMap = updated;
  }

  public clearPlayerInputMappings(): void {
    this.playerInputMap.clear();
  }

  private getKeyboardScheme(playerIndex: number): KeyboardScheme | null {
    const mapping = this.playerInputMap.get(playerIndex);
    if (mapping) {
      if (mapping.inputType === 'KEYBOARD_WASD') return 'WASD';
      if (mapping.inputType === 'KEYBOARD_ARROWS') return 'ARROWS';
      return null;
    }
    if (playerIndex === 0) return 'WASD';
    if (playerIndex === 1) return 'ARROWS';
    return null;
  }

  private getGamepadForPlayer(playerIndex: number): Gamepad | null {
    const mapping = this.playerInputMap.get(playerIndex);
    if (mapping) {
      if (mapping.inputType !== 'GAMEPAD') return null;
      if (mapping.controllerId === null || mapping.controllerId === undefined) return null;
      return navigator.getGamepads()[mapping.controllerId] || null;
    }
    return navigator.getGamepads()[playerIndex] || null;
  }

  public wasButtonJustPressed(controllerIndex: number, buttonIndex: number): boolean {
    const gp = navigator.getGamepads()[controllerIndex];
    if (!gp) return false;
    const prev = this.prevButtonStates.get(controllerIndex);
    const wasPressed = prev ? prev[buttonIndex] : false;
    const isPressed = gp.buttons[buttonIndex]?.pressed ?? false;
    return isPressed && !wasPressed;
  }

  public updatePrevButtonStates(): void {
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < 4; i++) {
      const gp = gamepads[i];
      if (gp) {
        this.prevButtonStates.set(i, gp.buttons.map(b => b.pressed));
      }
    }
  }

  public hasController(): boolean {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp && gp.connected) return true;
    }
    return false;
  }

  public getConnectedControllers(): number[] {
    const connected: number[] = [];
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < 4; i++) {
      if (gamepads[i] && gamepads[i]!.connected) connected.push(i);
    }
    return connected;
  }

  public getControllerCount(): number {
    return this.getConnectedControllers().length;
  }

  public isBackPressed(): boolean {
    if (this.keys.has('Escape')) return true;
    const gp = navigator.getGamepads()[0];
    if (gp) return gp.buttons[1].pressed; // B button
    return false;
  }

  public isConfirmPressed(): boolean {
    if (this.keys.has('Enter') || this.keys.has('Space')) return true;
    const gp = navigator.getGamepads()[0];
    if (gp) return gp.buttons[0].pressed; // A button
    return false;
  }

  public getUINavigation(): { x: number; y: number } | null {
    const now = Date.now();
    if (now < this.uiNavCooldown) return null;

    let dx = 0, dy = 0;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy = -1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy = 1;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx = -1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx = 1;

    const gp = navigator.getGamepads()[0];
    if (gp) {
      const threshold = 0.5;
      if (gp.axes[1] < -threshold || gp.buttons[12]?.pressed) dy = -1;
      if (gp.axes[1] > threshold || gp.buttons[13]?.pressed) dy = 1;
      if (gp.axes[0] < -threshold || gp.buttons[14]?.pressed) dx = -1;
      if (gp.axes[0] > threshold || gp.buttons[15]?.pressed) dx = 1;
    }

    if (dx !== 0 || dy !== 0) {
      this.uiNavCooldown = now + 200;
      return { x: dx, y: dy };
    }
    return null;
  }

  public isTabPressed(direction: 'left' | 'right'): boolean {
    const gp = navigator.getGamepads()[0];
    if (gp) {
      if (direction === 'left' && gp.buttons[4]?.pressed) return true; // LB
      if (direction === 'right' && gp.buttons[5]?.pressed) return true; // RB
    }
    return false;
  }

  public getMovement(playerIndex: number): { x: number; y: number } {
    let dx = 0;
    let dy = 0;

    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD') {
      if (this.keys.has('KeyW')) dy -= 1;
      if (this.keys.has('KeyS')) dy += 1;
      if (this.keys.has('KeyA')) dx -= 1;
      if (this.keys.has('KeyD')) dx += 1;
    } else if (scheme === 'ARROWS') {
      if (this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('ArrowDown')) dy += 1;
      if (this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('ArrowRight')) dx += 1;
    }

    const gp = this.getGamepadForPlayer(playerIndex);
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
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyE')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Digit0')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[7].pressed; // R2
    return false;
  }

  public isJumpPressed(playerIndex: number): boolean {
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('Space')) return true;
    if (scheme === 'ARROWS' && this.keys.has('ControlRight')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[0].pressed || gp.buttons[10].pressed; // A or L3
    return false;
  }

  public isBlockPressed(playerIndex: number): boolean {
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('ShiftLeft')) return true;
    if (scheme === 'ARROWS' && this.keys.has('ShiftRight')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[6].pressed || gp.buttons[1].pressed; // LT or B
    return false;
  }

  public isRevivePressed(playerIndex: number): boolean {
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyR')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Enter')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[2].pressed; // X
    return false;
  }

  public isMeleePressed(playerIndex: number): boolean {
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyF')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Period')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[1].pressed || gp.buttons[5].pressed; // B / R1
    return false;
  }

  public isLimitBreakPressed(playerIndex: number): boolean {
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyQ')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Numpad0')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    // L3+R3 together (both stick clicks)
    if (gp) return gp.buttons[10].pressed && gp.buttons[11].pressed;
    return false;
  }

  public isSkillPressed(playerIndex: number, skillIndex: number): boolean {
    const keys = [
      ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
      ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4']
    ];
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has(keys[0][skillIndex])) return true;
    if (scheme === 'ARROWS' && this.keys.has(keys[1][skillIndex])) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) {
        // Face buttons AND triggers/bumpers for dual controller layout
        if (skillIndex === 0) return gp.buttons[2].pressed || gp.buttons[4].pressed; // X + LB
        if (skillIndex === 1) return gp.buttons[3].pressed || gp.buttons[5].pressed; // Y + RB
        if (skillIndex === 2) return gp.buttons[1].pressed || gp.buttons[6].pressed; // B + LT
        if (skillIndex === 3) return gp.buttons[0].pressed || gp.buttons[7].pressed; // A + RT
    }
    return false;
  }

  public getAim(playerIndex: number): { x: number; y: number } | null {
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) {
      const threshold = 0.2;
      const rx = gp.axes[2];
      const ry = gp.axes[3];
      if (Math.abs(rx) > threshold || Math.abs(ry) > threshold) return { x: rx, y: ry };
    }
    return null;
  }

  public isShootPressed(playerIndex: number): boolean {
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyE')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Slash')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[7].pressed;
    return false;
  }

  public isBuildCancelPressed(playerIndex: number): boolean {
    if (this.keys.has('Escape') || this.keys.has('KeyC')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[1].pressed;
    return false;
  }

  // Magic Wheel Controls
  public isWheelOpenPressed(playerIndex: number): boolean {
    // LB or Tab to open wheel
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('Tab')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Backslash')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[4].pressed; // LB
    return false;
  }

  public isWheelSelectPressed(playerIndex: number): boolean {
    // RT or click to select element
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyE')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Slash')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[7].pressed; // RT
    return false;
  }

  public isWheelCastPressed(playerIndex: number): boolean {
    // RB or Space to cast
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('Space')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Enter')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[5].pressed; // RB
    return false;
  }

  public isWheelClearPressed(playerIndex: number): boolean {
    // B or Backspace to clear stack
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('Backspace')) return true;
    if (scheme === 'ARROWS' && this.keys.has('Delete')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[1].pressed; // B
    return false;
  }

  public isWheelModePressed(playerIndex: number): boolean {
    // Y or G to cycle cast mode
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyG')) return true;
    if (scheme === 'ARROWS' && this.keys.has('NumpadAdd')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[3].pressed; // Y
    return false;
  }

  public isModifierCyclePressed(playerIndex: number): boolean {
    // X or DPad-Right to cycle modifier
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD' && this.keys.has('KeyX')) return true;
    if (scheme === 'ARROWS' && this.keys.has('NumpadMultiply')) return true;
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) return gp.buttons[15].pressed; // DPad Right
    return false;
  }

  public getRightStick(playerIndex: number): { x: number; y: number } {
    const gp = this.getGamepadForPlayer(playerIndex);
    if (gp) {
      const rx = gp.axes[2] || 0;
      const ry = gp.axes[3] || 0;
      return { x: rx, y: ry };
    }
    // Keyboard fallback: numpad or IJKL for player 0/1
    let x = 0, y = 0;
    const scheme = this.getKeyboardScheme(playerIndex);
    if (scheme === 'WASD') {
      if (this.keys.has('KeyI')) y -= 1;
      if (this.keys.has('KeyK')) y += 1;
      if (this.keys.has('KeyJ')) x -= 1;
      if (this.keys.has('KeyL')) x += 1;
    }
    return { x, y };
  }
}
