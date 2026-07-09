/** Touch joystick + action buttons + keyboard/mouse for web & mobile */

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
    this.ads = false;
    this.prone = false;
    this.drone = false;
    this.dronePressed = false;
    this.pointerLocked = false;
    this.enabled = false;

    this._keys = new Set();
    this._joyTouch = null;
    this._lookTouch = null;
    this._lastLook = null;
    this._fireHeld = false;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.code;
      this._keys.add(k);
      if (k === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (k === 'KeyR') this.reloadPressed = true;
      if (k === 'KeyF' || k === 'KeyE') this.pickupPressed = true;
      if (k === 'KeyC') this.prone = !this.prone;
      if (k === 'KeyM') this.dronePressed = true;
      if (k === 'KeyV') this.ads = !this.ads;
    });
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
      if (e.code === 'Mouse0' || e.code === 'KeyV') { /* noop */ }
    });

    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('click', () => {
      if (!this.enabled) return;
      if (!this._isTouchDevice()) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.lookDelta.x += e.movementX;
      this.lookDelta.y += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      if (e.button === 0) { this.fire = true; this.firePressed = true; this._fireHeld = true; }
      if (e.button === 2) this.ads = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.fire = false; this._fireHeld = false; }
      if (e.button === 2) this.ads = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    this._setupJoystick();
    this._setupActions();
    this._setupLookZone();
  }

  _isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  _setupJoystick() {
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const zone = document.getElementById('joystick-zone');
    if (!base || !zone) return;

    const maxR = 40;
    const onStart = (e) => {
      if (!this.enabled) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      this._joyTouch = t.identifier ?? 'mouse';
      this._updateJoy(t, base, knob, maxR);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (this._joyTouch === null) return;
      const touches = e.changedTouches || [e];
      for (const t of touches) {
        if ((t.identifier ?? 'mouse') === this._joyTouch) {
          this._updateJoy(t, base, knob, maxR);
          e.preventDefault();
        }
      }
    };
    const onEnd = (e) => {
      const touches = e.changedTouches || [e];
      for (const t of touches) {
        if ((t.identifier ?? 'mouse') === this._joyTouch) {
          this._joyTouch = null;
          this.move.x = 0;
          this.move.y = 0;
          knob.style.transform = 'translate(0,0)';
        }
      }
    };

    zone.addEventListener('touchstart', onStart, { passive: false });
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd);
    zone.addEventListener('touchcancel', onEnd);
  }

  _updateJoy(t, base, knob, maxR) {
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    if (len > maxR) { dx = (dx / len) * maxR; dy = (dy / len) * maxR; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.move.x = dx / maxR;
    this.move.y = -dy / maxR;
  }

  _setupLookZone() {
    const zone = document.getElementById('look-zone');
    if (!zone) return;
    zone.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      const t = e.changedTouches[0];
      this._lookTouch = t.identifier;
      this._lastLook = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookTouch && this._lastLook) {
          this.lookDelta.x += (t.clientX - this._lastLook.x) * 1.4;
          this.lookDelta.y += (t.clientY - this._lastLook.y) * 1.4;
          this._lastLook = { x: t.clientX, y: t.clientY };
          e.preventDefault();
        }
      }
    }, { passive: false });
    zone.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookTouch) {
          this._lookTouch = null;
          this._lastLook = null;
        }
      }
    });
  }

  _setupActions() {
    const map = {
      'btn-fire': 'fire',
      'btn-jump': 'jump',
      'btn-prone': 'prone',
      'btn-ads': 'ads',
      'btn-reload': 'reload',
      'btn-pickup': 'pickup',
      'btn-drone-cam': 'drone',
    };
    for (const [id, act] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const start = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.enabled && act !== 'drone') return;
        el.classList.add('active');
        if (act === 'fire') { this.fire = true; this.firePressed = true; this._fireHeld = true; }
        if (act === 'jump') this.jumpPressed = true;
        if (act === 'reload') this.reloadPressed = true;
        if (act === 'pickup') this.pickupPressed = true;
        if (act === 'drone') this.dronePressed = true;
        if (act === 'prone') this.prone = !this.prone;
        if (act === 'ads') this.ads = !this.ads;
      };
      const end = (e) => {
        e.preventDefault();
        el.classList.remove('active');
        if (act === 'fire') { this.fire = false; this._fireHeld = false; }
      };
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', end);
      el.addEventListener('mouseleave', end);
    }
  }

  update() {
    // Keyboard movement merges with joystick
    let kx = 0, ky = 0;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) ky += 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) ky -= 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) kx -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) kx += 1;
    if (this._keys.has('ControlLeft') || this._keys.has('KeyC')) { /* prone via toggle */ }
    if (this._keys.has('KeyV') || this._keys.has('Mouse2')) this.ads = this._keys.has('KeyV') ? this.ads : this.ads;

    if (kx || ky) {
      const len = Math.hypot(kx, ky) || 1;
      this.move.x = kx / len;
      this.move.y = ky / len;
    } else if (this._joyTouch === null) {
      this.move.x = 0;
      this.move.y = 0;
    }

    this.jump = this._keys.has('Space') || this.jumpPressed;
    this.fire = this._fireHeld;
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
}
