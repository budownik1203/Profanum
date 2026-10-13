/**
 * Keyboard + mouse → InputState (design doc: Sterowanie).
 * WSAD move, the mouse aims, LMB shoots, RMB / Shift dissolve into mist, R reloads, Space topples
 * cover, E interacts or raises a corpse, Q orders the minions, F uses the relic, C the special,
 * the wheel / Tab / 1-9 switch weapons, Esc pauses.
 */
import type { InputState } from "./game/types.js";
import type { Vec } from "./game/math.js";

const GAME_KEYS = ["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "KeyF", "KeyC", "KeyR", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseDown = false;
  private wheel = 0;
  /** Mouse position in screen (canvas CSS) pixels. */
  mouse: Vec = { x: 0, y: 0 };

  constructor(target: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (GAME_KEYS.includes(e.code) || /^Digit[1-9]$/.test(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    target.addEventListener("contextmenu", (e) => e.preventDefault());
    target.addEventListener("pointermove", (e) => {
      this.mouse = { x: e.offsetX, y: e.offsetY };
    });
    target.addEventListener("pointerdown", (e) => {
      this.mouse = { x: e.offsetX, y: e.offsetY };
      if (e.button === 0) {
        this.mouseDown = true;
        this.pressed.add("Mouse0");
      }
      if (e.button === 2) this.pressed.add("Mouse2");
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    target.addEventListener(
      "wheel",
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** True once per key press. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Build the per-step input; `aimWorld` converts the mouse to world coordinates. */
  read(aimWorld: Vec): InputState {
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    let slot = -1;
    for (let i = 1; i <= 9; i++) if (this.pressed.has(`Digit${i}`)) slot = i - 1;
    const cycle = Math.sign(this.wheel) + (this.pressed.has("Tab") ? 1 : 0);
    return {
      move: { x: k("KeyD") - k("KeyA") + k("ArrowRight") - k("ArrowLeft"), y: k("KeyS") - k("KeyW") + k("ArrowDown") - k("ArrowUp") },
      aim: aimWorld,
      shoot: this.mouseDown,
      dodge: this.pressed.has("Mouse2") || this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"),
      reload: this.pressed.has("KeyR"),
      flip: this.pressed.has("Space"),
      interact: this.pressed.has("KeyE"),
      command: this.pressed.has("KeyQ"),
      relic: this.pressed.has("KeyF"),
      special: this.pressed.has("KeyC"),
      cycle: Math.max(-1, Math.min(1, cycle)),
      slot,
    };
  }

  /** Release the fire button (after a menu click, so the click doesn't shoot). */
  releaseMouse(): void {
    this.mouseDown = false;
  }

  /** Call once per rendered frame after the simulation consumed the edges. */
  endFrame(): void {
    this.pressed.clear();
    this.wheel = 0;
  }
}
