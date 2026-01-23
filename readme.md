Dưới đây là đề xuất hoàn chỉnh — gồm topic convention, sequence (provision → pairing → normal ops), bảo mật, xử lý ACL/auth bằng EMQX + NestJS, và các tip vận hành (LWT, retained, QoS, rate-limit). Mình trình bày theo từng phần để dễ áp dụng.

1) Quy ước topic (sạch, an toàn, dễ quản lý)

## provision/new

Device → Broker. Dùng chỉ trong giai đoạn đưa thiết bị lên mạng (provisioning).

Payload ví dụ: { "serial":"SN123", "hw":"v1", "nonce":"...", "sig":"..." }

device/{deviceId}/status

Device → Broker: báo trạng thái định kỳ (telemetry, heartbeat). QoS 1, retained tùy trường hợp.

device/{deviceId}/telemetry

Device → Broker: dữ liệu cảm biến (QoS 0/1 tùy yêu cầu).

user/{userId}/device/{deviceId}/cmd

Server → Device (qua broker): lệnh từ app/REST. QoS 1, không retained.

user/{userId}/device/{deviceId}/resp

Device → Server/App: phản hồi lệnh (QoS 1).

user/{userId}/notifications

Server → Mobile: thông báo chung cho user (MQTT over WS subscription).

Ghi chú: dùng userId (UUID) thay vì username để tránh lộ thông tin. Có thể thêm phiên bản v1/... nếu cần migration.

2) Authentication & ACL (EMQX + NestJS)

Mục tiêu: Broker chỉ chấp nhận kết nối publish/subscribe nếu user/device đã được xác thực và cho phép theo ACL.

A. Cơ chế xác thực

Device: xác thực bằng Device Token (JWT ngắn hạn hoặc HMAC token) hoặc client cert.

Khi pairing xong, server tạo token (ví dụ: JWT chứa deviceId, exp) và gửi xuống device; device dùng token làm username/password hoặc dùng token trong Connect username/password.

Mobile / Server (apps): xác thực bằng JWT user (đăng nhập via REST → nhận JWT) → dùng để kết nối MQTT over WebSocket (username = jwt hoặc username=userId + password=jwt).

B. ACL (EMQX)

Quy tắc chung: chỉ cho phép client device:{deviceId} publish vào device/{deviceId}/# và subscribe vào user/{ownerId}/device/{deviceId}/# sau khi record ownerId được xác thực.

Triển khai: EMQX gọi HTTP ACL/auth hook → NestJS endpoint (/emqx/auth & /emqx/acl) để kiểm tra DB (Devices, Owners).

auth trả về allow/deny dựa trên token.

acl kiểm tra topic pattern vs owner/device.

Ví dụ ngắn (logic):

Nếu client connect với token chứa deviceId=D123, NestJS kiểm tra DB: D123 exists && token valid → allow.

Khi client thao tác topic user/U456/device/D123/cmd, ACL kiểm tra DB: does D123.owner == U456? Nếu không → deny.

3) Pairing / Provisioning flow (chi tiết)
A. Sản xuất

Thiết bị có serial + deviceId (together or deviceId derived), và một key nội bộ (HMAC key) được nạp sẵn (hoặc dùng asymmetric key).

B. Provisioning (khi thiết bị lần đầu lên mạng)

Device kết nối broker (anonymous hoặc temporary creds) → publish vào provision/new payload { serial, hw, nonce, sig }.

Broker forward message tới NestJS (qua subscription service hoặc webhook plugin).

NestJS:

Kiểm tra serial hợp lệ (DB / inventory).

Nếu cần, validate sig dùng key nhà sản xuất để chống giả mạo.

Tạo một pairing token (short-lived) hoặc mark device trạng thái pending.

Trả về (publish) vào device/{deviceId}/provision/resp với pairing_token và hướng dẫn next-step (hoặc chờ người dùng nhập code).

Người dùng trên Mobile: vào màn Pairing, nhập serial (hoặc quét QR) → App gọi POST /api/pair với user JWT và serial.

Server kiểm tra pairing_token hoặc serial pending → cập nhật Devices.owner_id = userId, tạo device_token (longer lived JWT/HMAC) và gửi command tới device: user/{userId}/device/{deviceId}/cmd { "cmd":"set_owner","ownerId":"userId","token":"..." }.

Device nhận lệnh, lưu token + thay đổi topic prefix (từ provisioning → user-specific topics).

Lưu ý bảo mật pairing: không nên chỉ dựa vào serial công khai; dùng challenge-response, OTP trong app, hoặc quét QR chứa ký số.

4) Normal operation: message flows

Telemetry: Device → device/{deviceId}/telemetry → Broker → (subscribe by Server or Worker) → NestJS xử lý → lưu DB/stream đến apps.

Command from mobile: Mobile → Server REST (POST /api/devices/{deviceId}/cmd) hoặc mobile publish trực tiếp nếu được phép → Server hoặc Broker publish user/{userId}/device/{deviceId}/cmd → Device nhận, trả resp.

Realtime to app: Mobile subscribes to user/{userId}/# via MQTT over WebSocket → nhận status/notifications ngay lập tức.

5) NestJS: vai trò & REST endpoints gợi ý

Roles:

Auth service (JWT signin/signup)

Provisioning controller (handle provision/new messages)

Device controller (pairing, issue device tokens, disconnect)

EMQX hook controller (auth & acl)

Telemetry ingestion & persistence workers

Endpoints mẫu

POST /api/pair { serial } — pairing request from mobile.

POST /api/devices/:id/disconnect — server force disconnect a device.

GET /api/devices?owner=:userId — list devices for dashboard.

EMQX hook endpoints

POST /emqx/auth — verify connect credentials.

POST /emqx/acl — verify pub/sub rights.

6) Broker config & ops (EMQX)

Kích hoạt: TLS (443/8883), WebSocket TLS (wss), HTTP hook plugin cho auth/acl nên bật.

Kích hoạt LWT (Last Will and Testament): mỗi device khi connect set LWT topic user/{userId}/device/{deviceId}/status message { "status":"offline","ts":... }.

Rate-limit / flood control plugin: block devices publish quá nhiều (spam).

Monitoring: EMQX dashboard + metrics → alert khi connections spike.

Retained messages: chỉ dùng cho device/{deviceId}/status nếu muốn clients mới subscribe biết trạng thái hiện tại.

7) QoS & message guarantees

Telemetry (high-volume): QoS 0 hoặc 1 (tùy quan trọng).

Command/Response & critical state: QoS 1 (at least once), kiểm tra idempotency trong device/Server.

Use message ID / correlationId field trong payload để trace.

8) Security hardening & extra suggestions

Transport security: TLS mandatory (broker + ws).

Token lifecycle: device tokens rotate; support revocation in DB and immediate disconnect via EMQX API when revoked.

Least privilege ACL: hạn chế topics chỉ cần thiết.

Rate limiting & quotas per device/user.

Audit logs: mọi auth/acl decision + sensitive actions (pair/unpair, disconnect).

OTA / firmware: ký image, dùng secure boot chain.

Pen-tests: cố gắng test pairing path cho replay/forgery.

9) Ví dụ sequence ngắn (pairing → command)

Device power on → publish provision/new (serial + signature).

NestJS verifies → publishes device/D123/provision/resp with pairing token.

User on Mobile enters serial → POST /api/pair → NestJS links Device D123 → sets ownerId=U456 → issues device_token.

NestJS publishes user/U456/device/D123/cmd {cmd:"set_owner","token":"<device_token>"}.

Device subscribes to user/U456/device/D123/# using token → now only owner U456 app can send commands.

Mobile sends command via REST or directly publishes to user/U456/device/D123/cmd.

10) Mẫu nhỏ: EMQX HTTP ACL response (ý tưởng)
// NestJS pseudo (very high-level)
@Post('/emqx/acl')
async emqxAcl(@Body() body) {
  // body: { username, clientid, access, topic }
  // access: 1 = subscribe, 2 = publish
  const { username, topic, access } = body;
  const userId = await decodeUsernameToUserId(username); // or from token
  if (topicMatchesOwnership(topic, userId)) return { result: 'allow' };
  return { result: 'deny' };
}


(EMQX HTTP auth/acl expects specific JSON; implement per EMQX docs.)

11) Tóm tắt kiến trúc đề xuất (ngắn gọn)

Broker (EMQX): transport + connection mgmt + hook → call NestJS for auth/acl.

NestJS: source-of-truth logic (pairing, token issuance, auth/acl webhook, REST APIs).

Postgres: Users, Devices, DeviceKeys, PairingTokens, AuditLogs.

Mobile: connect via MQTT over WebSocket (wss) using user JWT; subscribe to user/{userId}/#.

Device: connect via MQTT TLS using device token; topics scoped to device/{deviceId} + user/{userId}/device/{deviceId}.