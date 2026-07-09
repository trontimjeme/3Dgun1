---
name: lego-style-controls
description: >-
  LEGO-style on-screen game controls for web/mobile shooters and 3D games —
  left virtual joystick, right arc of circular action buttons, mini-shoot near
  stick, CS-style pointer lock + keyboard bindings (WASD, Space, Shift, LMB/RMB,
  R/Q/V/G/C). Use when the user asks for "LEGO style controls", "LEGO-style
  controls", nút bấm màn hình kiểu LEGO, mobile FPS controls, joystick + arc
  buttons, or to improve/iterate touch HUD controls across projects.
retrieval:
  aliases:
    - LEGO style controls
    - LEGO-style controls
    - lego controls
    - nút bấm màn hình
    - mobile FPS controls
    - joystick arc buttons
  intents:
    - add mobile game controls
    - improve touch HUD
    - match LEGO City Shooter controls
    - add virtual joystick
  entities:
    - joystick
    - arc buttons
    - pointer lock
    - touch controls
---

# LEGO-style Controls (on-screen buttons)

Reusable control scheme for **web + mobile 3D/FPS games**, evolved from LEGO City Shooter / Block Tactical.

When the user says **"LEGO style controls"** / **"LEGO-style controls"** / **"nút bấm màn hình LEGO"**, apply this skill. Prefer improving an existing HUD over inventing a new layout.

## Goals

1. **One thumb move** (left) + **one thumb look/actions** (right)
2. Same actions on **keyboard/mouse** and **touch**
3. Large hit targets; circular buttons; arc cluster around the big Fire button
4. Works in landscape; safe-area aware; `touch-action: none`

## Layout (must follow)

```
┌─────────────────────────────────────────────┐
│  [Drone/extra]                    HUD ammo  │
│                                             │
│              (look drag / pointer lock)     │
│                                             │
│  ┌────┐                          ○ Nạp      │
│  │Joy │  ○mini-fire         ○Zoom  ○Đổi     │
│  │stick│                   ○Chạy            │
│  └────┘                 ○Nhảy  ○Nằm   ⬤BẮN  │
└─────────────────────────────────────────────┘
```

| Zone | Spec |
|------|------|
| **Joystick hit zone** | Bottom-left, ~`min(52vw,260px)` × `min(62vh,300px)` — larger than visual stick |
| **Visual stick** | Fixed ~118×118, safe-area inset; knob radius ~44px |
| **Grab radius** | ~95px from stick center; farther touches = look-drag, not move |
| **Mini-fire** | Just above/right of stick (~46×46), red accent |
| **Right cluster** | ~280×230 container, bottom-right safe-area |
| **Big Fire** | ~78×78, outermost right, red glow — arc anchor |
| **Arc buttons** | Absolute positions curving up-left from Fire (Nhặt, Zoom, Đổi, Nạp, Chạy, Nhảy, Nằm) |
| **Look zone** | Full-screen under controls (`pointer-events` on look; controls `pointer-events: auto` on children) |

### Button sizes

- `.sm-btn`: 48×48  
- `.big-btn`: 62×62  
- `.fire-btn`: 78×78  
- Labels: tiny uppercase under icon (6–7px)

### Colors (accents)

- Fire / mini-fire: red `rgba(180,0,0,0.42)` + border `rgba(231,76,60,0.75)`
- Reload / Sprint: orange
- Jump / Zoom: blue
- Pickup: green
- Switch weapon: purple
- Prone: grey

Desktop: keep touch UI at ~0.35–0.4 opacity so mouse users still can click; full opacity on mobile.

## Keyboard / mouse (canonical)

| Input | Action |
|-------|--------|
| WASD / arrows | Move |
| Space | Jump |
| Shift or **B** | Sprint (hold) |
| **LMB** (pointer locked) | Fire |
| **RMB** or **G** | Cycle zoom / ADS (0 → 1 → 2 → 0) |
| **R** | Reload |
| **Q** | Pickup |
| **V** | Switch weapon / loadout slot |
| **C** | Toggle prone |
| **M** | Drone / overview cam (optional) |
| Click canvas | Request pointer lock (PC) |
| ESC | Unlock pointer (browser) |

Ignore keybinds when `document.activeElement` is an `INPUT`.

## Implementation rules

1. Prefer **Pointer Events** + `setPointerCapture` over raw touch-only APIs (iOS reliability).
2. Joystick: normalize to `move.x / move.y` in `[-1,1]`; **up = forward** (`move.y` positive when knob up).
3. Fire: support both **press edge** (`firePressed`) and **hold** (`fire` / `_fireHeld`) for semi vs auto weapons.
4. Zoom: `scopeLevel` 0/1/2 → FOV `base`, `base/1.5`, `base/3` (not only a boolean ADS).
5. Separate **lookDelta** accumulation; consume+clear each frame.
6. `#look-zone` must not block buttons: controls container `pointer-events: none`, interactive children `pointer-events: auto`.
7. Prevent `contextmenu`; prevent Space scroll when playing.
8. Show a “Click to lock mouse” hint when running on desktop and pointer unlocked.

## HTML skeleton

```html
<div id="touch-controls">
  <div id="look-zone"></div>
  <div id="joystick-zone">
    <div id="joystick-visual">
      <div id="joystick-base"></div>
      <div id="joystick-knob"></div>
    </div>
    <button type="button" class="sm-btn" id="btn-fire-mini">🔴</button>
  </div>
  <div id="hunter-btns">
    <button type="button" class="sm-btn arc-btn" id="btn-pickup" style="left:145px;top:138px;">…</button>
    <button type="button" class="sm-btn arc-btn" id="btn-ads" style="left:203px;top:78px;">…</button>
    <button type="button" class="sm-btn arc-btn" id="btn-switch" style="left:118px;top:78px;">…</button>
    <button type="button" class="big-btn arc-btn" id="btn-reload" style="left:225px;top:34px;">…</button>
    <button type="button" class="sm-btn arc-btn" id="btn-sprint" style="left:80px;top:108px;">…</button>
    <button type="button" class="sm-btn arc-btn" id="btn-jump" style="left:55px;top:150px;">…</button>
    <button type="button" class="sm-btn arc-btn" id="btn-prone" style="left:100px;top:175px;">…</button>
    <button type="button" class="fire-btn arc-btn" id="btn-fire">…</button>
  </div>
</div>
```

IDs above are the **canonical contract**. Map them in the Controls class; do not rename casually so future iterations stay compatible.

## JS Controls class contract

Expose (or equivalent):

```js
{
  move: { x, y },
  lookDelta: { x, y },
  fire, firePressed,
  jumpPressed, reloadPressed, pickupPressed, switchWeaponPressed, dronePressed,
  ads, scopeLevel, prone, sprinting,
  enabled, pointerLocked,
  update(), consumeLook(), consumePress(name), fovForScope(base)
}
```

Reference implementation patterns live in project files when present:

- `js/controls.js` — input class
- `css/style.css` — `#touch-controls`, `#joystick-zone`, `#hunter-btns`, `.arc-btn`
- `index.html` — HUD markup

When starting a **new** repo, copy those patterns rather than inventing a dashboard-style button grid.

## Iteration checklist (improve gradually)

When asked to improve LEGO-style controls, change **one concern per pass** and keep the layout:

- [ ] Dead-zone / stick feel / sprint while aiming
- [ ] Button hit-testing vs look-drag conflicts
- [ ] iOS Safari / fake-landscape coordinate transforms (if CSS rotate wrapper exists)
- [ ] Haptic / press scale feedback
- [ ] Show/hide clusters by role (hunter vs hider) without moving Fire anchor
- [ ] Accessibility: larger targets on small phones (`transform: scale` on `#hunter-btns`)
- [ ] Sync new actions to **both** keyboard and touch
- [ ] Keep Vietnamese short labels on buttons when the game UI is Vietnamese

## Anti-patterns

- Do not replace the arc with a flat grid of equal buttons
- Do not put the only Fire button on the left
- Do not require multitouch chords for basic shoot/move
- Do not use tiny &lt;40px primary actions
- Do not bind **V** to ADS if the game has weapon switching — **V = switch**, **G/RMB = zoom**

## Optional: fake landscape (phones)

If the game uses a CSS `rotate(90deg)` wrapper for iOS landscape:

- Convert touch deltas with a `toVisualDelta(dx,dy)` helper before applying look/joystick
- Document that clientX/Y are in screen space, not rotated visual space

## Response style when applying this skill

1. Confirm you are applying **LEGO-style controls**
2. Wire HTML + CSS + Controls to the canonical IDs/bindings
3. Note any game-specific extras (drone, melee, smoke) placed on the **arc**, not in the first viewport chrome
4. If improving: list what changed vs the previous iteration
