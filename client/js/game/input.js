// Tastatur/Maus mit frei belegbaren Tasten und Pointer Lock.
import { settings } from '../settings.js';

export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();   // seit letztem Abfragen gedrückt (Flanken)
    this.mx = 0; this.my = 0;
    this.locked = false;
    this.enabled = true;
    this.typing = false;
    this.handlers = {};
    this.onKey = (e) => {
      if (this.typing) return;
      const code = e.code;
      if (e.type === 'keydown') {
        if (code === 'Tab' || code === 'Space' || (e.ctrlKey && code !== 'ControlLeft')) e.preventDefault();
        if (!this.down.has(code)) this.pressed.add(code);
        this.down.add(code);
        this.handlers.key?.(code, e);
      } else this.down.delete(code);
    };
    this.onMouse = (e) => {
      if (!this.locked) return;
      const code = 'Mouse' + e.button;
      if (e.type === 'mousedown') { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); this.handlers.key?.(code, e); }
      else this.down.delete(code);
    };
    this.onMove = (e) => { if (this.locked) { this.mx += e.movementX; this.my += e.movementY; } };
    this.onLock = () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) { this.down.clear(); this.handlers.unlock?.(); }
    };
    this.onWheel = (e) => { if (this.locked) this.handlers.wheel?.(Math.sign(e.deltaY)); };
    this.onCtx = (e) => e.preventDefault();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('mousedown', this.onMouse);
    window.addEventListener('mouseup', this.onMouse);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('contextmenu', this.onCtx);
    document.addEventListener('pointerlockchange', this.onLock);
    window.addEventListener('blur', () => this.down.clear());
  }
  lock() { if (!this.locked) this.el.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  is(action) { return this.down.has(settings.controls.keys[action]); }
  was(action) { return this.pressed.has(settings.controls.keys[action]); }
  endFrame() { this.pressed.clear(); }
  takeMouse() { const r = [this.mx, this.my]; this.mx = 0; this.my = 0; return r; }
  dispose() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('mousedown', this.onMouse);
    window.removeEventListener('mouseup', this.onMouse);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('contextmenu', this.onCtx);
    document.removeEventListener('pointerlockchange', this.onLock);
  }
}
