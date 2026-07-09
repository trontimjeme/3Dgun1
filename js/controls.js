/**
 * Controls matching LEGO City Shooter reference:
 * WASD move · Space jump · Shift/B sprint · R reload · Q pickup
 * V switch weapon · G / RMB zoom(ADS) · LMB shoot · C prone
 * Mobile: left joystick + mini-shoot, right arc buttons
 */

export class Controls {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.fire = false;
    this.firePressed = false;
    this.jump = false;
    this.jumpPressed = false;
    this.reload = false;
    this.reloadPressed = false;
    this.pickup = false;
    this.pickupPressed = false;
    this.switchWeaponPressed = false;
    this.viewTogglePressed = false;
    this.ads = false;
    this.scopeLevel = 0; // 0 off, 1 mid, 2 max (like reference)
    this.prone = false;
    this.sprinting = false;
    this.drone = false;
    this.dronePressed = false;
    this.pointerLocked = false;
    this.enabled = false;
    /** Sandbox: mouse look/fire without pointer lock */
    this.sandboxMouse = false;
    this._sandboxLook = false;
    this._lastSandboxLook = null;

    this._keys = new Set();
    this._joyPointer = null;
    this._lookPointer = null;
    this._lastLook = null;
    this._fireHeld = false;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target?.tagName === 'INPUT') return;
      const k = e.code;
      this._keys.add(k);

      if (k === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (k === 'KeyR') this.reloadPressed = true;
      if (k === 'KeyQ') this.pickupPressed = true;
      if (k === 'KeyV') this.switchWeaponPressed = true;
      if (k === 'KeyH') this.viewTogglePressed = true;
      if (k === 'KeyC') this.prone = !this.prone;
      if (k === 'KeyM') this.dronePressed = true;
      if (k === 'KeyG') this._cycleScope();
      if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyB') this.sprinting = true;
    });

    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyB') {
        this.sprinting = false;
      }
    });

    const canvas = document.getElementById('game-canvas');
    const lookZone = document.getElementById('look-zone');

    const tryLock = () => {
      if (!this.enabled) return;
      if (!this._isTouchDevice()) canvas?.requestPointerLock?.();
    };
    canvas?.addEventListener('click', tryLock);

    // Sandbox: hold mouse on canvas to look around without pointer lock
    canvas?.addEventListener('pointerdown', (e) => {
      if (!this.enabled || !this.sandboxMouse || this.pointerLocked) return;
      if (e.pointerType === 'mouse' && e.button === 0) {
        this._sandboxLook = true;
        this._lastSandboxLook = { x: e.clientX, y: e.clientY };
      }
    });
    const endSandboxLook = () => {
      this._sandboxLook = false;
      this._lastSandboxLook = null;
    };
    canvas?.addEventListener('pointerup', endSandboxLook);
    canvas?.addEventListener('pointerleave', endSandboxLook);

    lookZone?.addEventListener('click', tryLock);

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      const hint = document.getElementById('click-hint');
      if (hint) {
        hint.classList.toggle('hidden', !this.enabled || this.pointerLocked || this._isTouchDevice());
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        this.lookDelta.x += e.movementX;
        this.lookDelta.y += e.movementY;
        return;
      }
      // Sandbox test: drag on canvas to look (no pointer lock needed)
      if (this.sandboxMouse && this._sandboxLook && this._lastSandboxLook) {
        this.lookDelta.x += (e.clientX - this._lastSandboxLook.x) * 0.8;
        this.lookDelta.y += (e.clientY - this._lastSandboxLook.y) * 0.8;
        this._lastSandboxLook = { x: e.clientX, y: e.clientY };
      }
    });

    // Reference: LMB = shoot, RMB = zoom cycle
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        if (e.button === 0) {
          this.fire = true;
          this.firePressed = true;
          this._fireHeld = true;
        } else if (e.button === 2) {
          this._cycleScope();
        }
        return;
      }
      // Sandbox: LMB on canvas fires without pointer lock
      if (this.sandboxMouse && e.button === 0 && e.target?.id === 'game-canvas') {
        this.fire = true;
        this.firePressed = true;
        this._fireHeld = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.fire = false;
        this._fireHeld = false;
      }
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    this._setupJoystick();
    this._setupButtons();
    this._setupLookZone();
  }

  _cycleScope() {
    this.scopeLevel = (this.scopeLevel + 1) % 3;
    this.ads = this.scopeLevel > 0;
  }

  _isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  _setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    if (!zone || !base || !knob) return;

    const maxR = 44;
    const grabR = 95;

    const center = () => {
      const r = base.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    const move = (cx, cy) => {
      const c = center();
      let dx = cx - c.x;
      let dy = cy - c.y;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, maxR);
      const nx = dx / len;
      const ny = dy / len;
      this.move.x = nx * (cl / maxR);
      this.move.y = -ny * (cl / maxR);
      knob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
    };

    const reset = () => {
      this.move.x = 0;
      this.move.y = 0;
      knob.style.transform = 'translate(-50%, -50%)';
      this._joyPointer = null;
    };

    zone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const c = center();
      const dist = Math.hypot(e.clientX - c.x, e.clientY - c.y);
      if (dist > grabR && e.pointerType !== 'mouse') {
        // Far from stick → look drag
        this._lookPointer = e.pointerId;
        this._lastLook = { x: e.clientX, y: e.clientY };
        return;
      }
      this._joyPointer = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (_) {}
      move(e.clientX, e.clientY);
      e.preventDefault();
    }, { passive: false });

    zone.addEventListener('pointermove', (e) => {
      if (this._lookPointer === e.pointerId && this._lastLook) {
        this.lookDelta.x += (e.clientX - this._lastLook.x) * 1.4;
        this.lookDelta.y += (e.clientY - this._lastLook.y) * 1.4;
        this._lastLook = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }
      if (this._joyPointer !== e.pointerId) return;
      move(e.clientX, e.clientY);
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      if (this._lookPointer === e.pointerId) {
        this._lookPointer = null;
        this._lastLook = null;
        return;
      }
      if (this._joyPointer === e.pointerId) reset();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _setupLookZone() {
    const zone = document.getElementById('look-zone');
    if (!zone) return;

    zone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') return; // mouse uses pointer lock
      this._lookPointer = e.pointerId;
      this._lastLook = { x: e.clientX, y: e.clientY };
      try { zone.setPointerCapture(e.pointerId); } catch (_) {}
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._lookPointer || !this._lastLook) return;
      this.lookDelta.x += (e.clientX - this._lastLook.x) * 1.4;
      this.lookDelta.y += (e.clientY - this._lastLook.y) * 1.4;
      this._lastLook = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      if (e.pointerId === this._lookPointer) {
        this._lookPointer = null;
        this._lastLook = null;
      }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _setupButtons() {
    const bind = (id, onDown, onUp = null) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.touchAction = 'none';
      let activeId = null;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.enabled && id !== 'btn-drone-cam') return;
        activeId = e.pointerId;
        el.classList.add('active');
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        onDown();
      }, { passive: false });
      if (onUp) {
        const release = (e) => {
          if (activeId !== null && e.pointerId !== activeId) return;
          activeId = null;
          el.classList.remove('active');
          onUp();
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
      } else {
        el.addEventListener('pointerup', () => el.classList.remove('active'));
        el.addEventListener('pointercancel', () => el.classList.remove('active'));
      }
    };

    bind('btn-fire', () => { this.fire = true; this.firePressed = true; this._fireHeld = true; }, () => { this.fire = false; this._fireHeld = false; });
    bind('btn-fire-mini', () => { this.firePressed = true; this._fireHeld = true; this.fire = true; }, () => { this.fire = false; this._fireHeld = false; });
    bind('btn-jump', () => { this.jumpPressed = true; });
    bind('btn-reload', () => { this.reloadPressed = true; });
    bind('btn-pickup', () => { this.pickupPressed = true; });
    bind('btn-switch', () => { this.switchWeaponPressed = true; });
    bind('btn-ads', () => { this._cycleScope(); });
    bind('btn-prone', () => { this.prone = !this.prone; });
    bind('btn-sprint', () => { this.sprinting = true; }, () => { this.sprinting = false; });
    bind('btn-drone-cam', () => { this.dronePressed = true; });
    bind('btn-third-person', () => { this.viewTogglePressed = true; });
  }

  update() {
    let kx = 0, ky = 0;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) ky += 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) ky -= 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) kx -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) kx += 1;

    if (kx || ky) {
      const len = Math.hypot(kx, ky) || 1;
      this.move.x = kx / len;
      this.move.y = ky / len;
    } else if (this._joyPointer === null) {
      this.move.x = 0;
      this.move.y = 0;
    }

    this.jump = this._keys.has('Space') || this.jumpPressed;
    this.fire = this._fireHeld;
    if (this._keys.has('ShiftLeft') || this._keys.has('ShiftRight') || this._keys.has('KeyB')) {
      this.sprinting = true;
    }
  }

  consumeLook() {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return d;
  }

  consumePress(name) {
    const key = name + 'Pressed';
    if (this[key]) {
      this[key] = false;
      return true;
    }
    return false;
  }

  fovForScope(base = 75) {
    if (this.scopeLevel === 1) return base / 1.5;
    if (this.scopeLevel === 2) return base / 3;
    return base;
  }
}
