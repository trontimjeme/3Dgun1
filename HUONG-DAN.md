# Cách chạy game

## Yêu cầu
- Node.js 18+ ([tải tại đây](https://nodejs.org))

## Chạy local

```bash
git clone https://github.com/trontimjeme/3Dgun1.git
cd 3Dgun1
git checkout cursor/tactical-shooter-5v5-a251
npm install
npm start
```

Mở trình duyệt: **http://localhost:3000**

> Quan trọng: phải chạy `npm start` rồi mở qua `http://localhost:3000`.  
> **Không** double-click mở `index.html` — game cần server Socket.io.

## Nếu báo lỗi `EADDRINUSE` (port 3000 bận)

**Windows (PowerShell):**
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
npm start
```

**Mac / Linux:**
```bash
npx kill-port 3000
# hoặc
fuser -k 3000/tcp
npm start
```

Server cũng tự thử port tiếp theo (3001, 3002...) nếu 3000 bận — xem dòng log để biết port đúng.

## Chơi
1. Nhập tên
2. Bấm **Chơi với Bot 5v5** (nhanh nhất để test)
3. Đợi camera drone quay map → bấm banner hoặc đợi vào trận
4. Nhặt hộp súng vàng → bắn

### Mobile
Mở cùng địa chỉ trên điện thoại (cùng Wi‑Fi, dùng IP máy tính, ví dụ `http://192.168.1.x:3000`).
