# LEGO-style Controls — Reference snippets

Copy/adapt into new games. Keep element IDs stable.

## Minimal CSS

```css
#touch-controls { position:absolute; inset:0; z-index:12; pointer-events:none; }
#look-zone { position:absolute; inset:0; pointer-events:auto; z-index:1; touch-action:none; }

#joystick-zone {
  position:absolute; left:0; bottom:0;
  width:min(52vw,260px); height:min(62vh,300px);
  pointer-events:auto; z-index:3; touch-action:none;
}
#joystick-visual {
  position:absolute;
  left:max(22px, env(safe-area-inset-left));
  bottom:max(22px, env(safe-area-inset-bottom));
  width:118px; height:118px; pointer-events:none;
}
#joystick-base {
  position:absolute; inset:4px; border-radius:50%;
  background:rgba(255,255,255,0.08);
  border:2px solid rgba(255,255,255,0.25);
}
#joystick-knob {
  position:absolute; width:44px; height:44px; border-radius:50%;
  background:rgba(255,255,255,0.55);
  top:50%; left:50%; transform:translate(-50%,-50%);
}

#btn-fire-mini {
  position:absolute;
  left:max(132px, calc(env(safe-area-inset-left) + 132px));
  bottom:max(96px, calc(env(safe-area-inset-bottom) + 96px));
  width:46px; height:46px; pointer-events:auto; z-index:4;
  border-radius:50%; border:2.5px solid rgba(231,76,60,0.8);
  background:rgba(180,0,0,0.45);
}

#hunter-btns {
  position:absolute;
  right:max(8px, env(safe-area-inset-right));
  bottom:max(8px, env(safe-area-inset-bottom));
  width:280px; height:230px; pointer-events:none; z-index:3;
}
.arc-btn { position:absolute !important; pointer-events:auto; }
.sm-btn, .big-btn, .fire-btn {
  border-radius:50% !important;
  border:2.5px solid rgba(255,255,255,0.35);
  background:rgba(255,255,255,0.12);
  color:#fff; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  touch-action:none; user-select:none; padding:0;
}
.sm-btn { width:48px; height:48px; }
.big-btn { width:62px; height:62px; }
.fire-btn {
  right:0; bottom:18px; width:78px !important; height:78px !important;
  border-color:rgba(231,76,60,0.75) !important;
  background:rgba(180,0,0,0.42) !important;
  box-shadow:0 0 16px rgba(231,76,60,0.5);
}
```

## Arc positions (from Fire anchor)

| ID | left | top |
|----|------|-----|
| btn-pickup | 145px | 138px |
| btn-ads (zoom) | 203px | 78px |
| btn-switch | 118px | 78px |
| btn-reload | 225px | 34px |
| btn-sprint | 80px | 108px |
| btn-jump | 55px | 150px |
| btn-prone | 100px | 175px |
| btn-fire | right:0; bottom:18px | |

## Keybinds

WASD · Space jump · Shift/B sprint · LMB fire · RMB/G zoom · R reload · Q pickup · V switch · C prone · M drone
