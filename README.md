# Block Tactical 5v5

CS:GO-style 5v5 blocky tactical shooter for **web & mobile**.

## Chạy nhanh

```bash
git clone https://github.com/trontimjeme/3Dgun1.git
cd 3Dgun1
npm install
npm start
```

Mở trình duyệt: **http://localhost:3000**

> **Không** double-click `index.html`. Game cần server (`npm start`).

Nếu lỗi port 3000 bận → xem [HUONG-DAN.md](./HUONG-DAN.md).

## Features

- Courtyard estate map (walls, house, fountain, hedges, shed)
- Blocky LEGO/Roblox-style CT vs Terrorist characters
- 10 random weapon crates (AWP, AK-47, M4A1, MP31, UMP, Deagle, Glock, Nova, P90, USP)
- 5-minute rounds — CT wins if time runs out
- Mobile controls: left joystick, right action buttons (fire / pickup / reload / jump / prone / ADS)
- Drone overview camera at round start
- Online rooms (up to 5v5) + fill with bots / solo vs bots
- Lobby + chat

### Controls (desktop)

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look (click canvas to lock) |
| LMB | Fire |
| RMB / V | ADS |
| R | Reload |
| F / E | Pickup weapon crate |
| Space | Jump |
| C | Prone |
| M | Drone camera |

### Mobile

- Left: virtual joystick
- Right: circular buttons for fire, pickup, reload, jump, prone, ADS
- Drag right side of screen to look around
