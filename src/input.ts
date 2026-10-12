/**
 * Keyboard + mouse → InputState.
 * WSAD move, mouse aims, LMB shoots, RMB dissolves into mist (dodge), R reloads,
 * Space topples cover, Enter restarts after death or a cleared room.
 */
import type { InputState } from "./game/world.js";
import type { Vec } from "./game/math.js";

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseDown = false;
  /** Mouse position in screen (canvas CSS) pixels. */
  mouse: Vec = { x: 0, y: 0 };

  constructor(target: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
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
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.pressed.add("Mouse2");
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  /** True once per key press. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Build the per-step input; `aimWorld` converts the mouse to world coordinates. */
  read(aimWorld: Vec): InputState {
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    return {
      move: { x: k("KeyD") - k("KeyA"), y: k("KeyS") - k("KeyW") },
      aim: aimWorld,
      shoot: this.mouseDown,
      dodge: this.pressed.has("Mouse2") || this.pressed.has("ShiftLeft"),
      reload: this.pressed.has("KeyR"),
      flip: this.pressed.has("Space"),
    };
  }

  /** Call once per rendered frame after the simulation consumed the edges. */
  endFrame(): void {
    this.pressed.clear();
  }
}
