Architecture Analysis
Dựa trên codebase đã đọc, đây là breakdown cho tình huống multi-device.

Cách WebSocket hiện hoạt động
Room model hiện tại: Mỗi device có 1 room riêng device:{deviceId}


Server broadcast paths:
- broadcastDeviceData(deviceId, data)   → room: device:{deviceId}
- broadcastDeviceStatus(deviceId, data) → room: device:{deviceId}  
- broadcast(event, data)                → ALL clients (global)
Mobile subscribe flow:


Client emit: subscribeToDevice { deviceId: "device-1" }  → join room device:device-1
Client emit: subscribeToDevice { deviceId: "device-2" }  → join room device:device-2
Không có farm:{farmId} room nào cả.

Kịch bản 2+ Device cùng Farm
Mobile phải tự quản lý từng subscription:


Farm có 3 devices: A, B, C

Mobile khi mở Farm Dashboard:
  1. GET /api/device?farmId=xxx  → lấy danh sách [A, B, C]
  2. emit subscribeToDevice { deviceId: A }
  3. emit subscribeToDevice { deviceId: B }
  4. emit subscribeToDevice { deviceId: C }
  5. Lắng nghe events từ cả 3 rooms đồng thời
  6. Khi navigate khỏi screen → emit unsubscribeFromDevice × 3
Các vấn đề cụ thể Mobile gặp phải
1. Subscription lifecycle phức tạp

Mobile phải tự track subscriptions đang active. Nếu quên unsubscribe → memory leak + nhận events không cần thiết.


Screen stack risk:
  Farm Dashboard (sub A, B, C)
    → Device Detail A (sub A)     ← đang sub A 2 lần?
      → Back to Dashboard         ← unsub A hay giữ?
2. Không có farm-level real-time

getFarmDashboard là REST call, không có push update khi farm-level thay đổi. Nếu device D được thêm vào farm khi mobile đang mở dashboard → mobile không biết để subscribe D.

3. Double notification risk

Khi threshold breach:

ThresholdService → FCM push (đến tất cả mọi nơi)
ThresholdService → WebSocket alert (chỉ clients đang sub device đó)
Mobile online + đã subscribe → nhận cả 2: FCM notification + WebSocket deviceAlert. Phải deduplicate bằng alertLogId.

4. deviceProvisioned / devicePaired broadcast toàn cầu


// sync.service.ts
this.deviceGateway.broadcast('deviceProvisioned', { ... })  // → ALL clients!
Mọi user đang online đều nhận event này. Hiện tại 1 user nên không vấn đề, nhưng khi multi-user/multi-farm → data leak giữa users.

Design Recommendations
Option A: Farm-level room (Recommended - ít thay đổi nhất)

Thêm room farm:{farmId} song song với room device:


// Server: khi subscribe device, cũng join farm room
socket.join(`device:${deviceId}`)
socket.join(`farm:${farmId}`)   // thêm

// Server: broadcast farm-level events
broadcastToFarm(farmId, event, data)
Mobile chỉ cần 1 subscription cho toàn farm:


emit subscribeToFarm { farmId }
// nhận tất cả events của tất cả devices trong farm
Trade-off: Mobile nhận nhiều events hơn, phải filter theo deviceId ở client side.

Option B: Giữ nguyên, fix mobile logic

Mobile tự manage per-device subscriptions nhưng làm đúng:


Khi mount Farm Dashboard:
  1. Fetch device list
  2. Subscribe all devices
  3. Lưu vào state: activeSubscriptions: Set<deviceId>

Khi unmount:
  1. Loop activeSubscriptions → unsubscribeFromDevice
  2. Clear state

Khi có device mới (listen 'devicePaired'):
  1. Subscribe thêm device mới vào farm subscription list
Trade-off: Logic phức tạp ở mobile, dễ bug subscription leak.

Option C: Server push device list on change

Server emit farmDevicesUpdated khi device thêm/bớt trong farm. Mobile tự reconcile subscription list.

Verdict
Với team 2 người và chưa có user, Option A là pragmatic nhất:

Backend: thêm farm:{farmId} room, 1 event subscribeToFarm
Mobile: 1 subscription thay vì N
Không cần manage subscription list phức tạp
Fix luôn bug deviceProvisioned broadcast (scope xuống farm room thay vì all)
Effort: ~1-2 giờ backend + cập nhật mobile.

Next Actions
Thêm subscribeToFarm / unsubscribeFromFarm WebSocket event ở DeviceGateway
Khi broadcast deviceData, deviceStatus, deviceAlert → emit vào cả device:{id} và farm:{farmId}
Scope deviceProvisioned/devicePaired vào farm room thay vì global
Mobile subscribe 1 lần theo farmId, filter events bằng data.deviceId