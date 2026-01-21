# Ví dụ HTTP Requests

File này chứa các ví dụ HTTP requests cho tất cả các endpoints của ứng dụng.

**Base URL:** `http://localhost:3000`

---

## 🔐 Authentication Endpoints

### 1. Đăng ký tài khoản mới

**POST** `/auth/signUp`

#### cURL
```bash
curl -X POST http://localhost:3000/auth/signUp \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "password123",
    "avatar": "https://example.com/avatar.jpg",
    "is_admin": false
  }'
```

#### JavaScript (Fetch)
```javascript
fetch('http://localhost:3000/auth/signUp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'john_doe',
    password: 'password123',
    avatar: 'https://example.com/avatar.jpg',
    is_admin: false
  })
})
  .then(res => res.json())
  .then(data => {
    console.log('Access Token:', data.accessToken);
    console.log('Refresh Token:', data.refreshToken);
  });
```

#### Response
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Lưu ý:** Refresh token sẽ được tự động lưu vào cookie (httpOnly).

---

### 2. Đăng nhập

**POST** `/auth/signIn`

#### cURL
```bash
curl -X POST http://localhost:3000/auth/signIn \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "password123"
  }'
```

#### JavaScript (Fetch)
```javascript
fetch('http://localhost:3000/auth/signIn', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Để nhận cookie
  body: JSON.stringify({
    username: 'john_doe',
    password: 'password123'
  })
})
  .then(res => res.json())
  .then(data => {
    console.log('Access Token:', data.accessToken);
    // Lưu accessToken để dùng cho các request sau
    localStorage.setItem('accessToken', data.accessToken);
  });
```

#### Response
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 3. Refresh Access Token

**POST** `/auth/update`

#### cURL
```bash
curl -X POST http://localhost:3000/auth/update \
  -H "Content-Type: application/json" \
  --cookie "refreshToken=YOUR_REFRESH_TOKEN"
```

#### JavaScript (Fetch)
```javascript
fetch('http://localhost:3000/auth/update', {
  method: 'POST',
  credentials: 'include', // Gửi cookie tự động
  headers: {
    'Content-Type': 'application/json',
  }
})
  .then(res => res.json())
  .then(data => {
    console.log('New Access Token:', data.accessToken);
    localStorage.setItem('accessToken', data.accessToken);
  });
```

#### Response
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 🏠 Room Endpoints

**Lưu ý:** Tất cả các endpoints dưới đây (trừ GET /room) đều yêu cầu JWT token trong header.

### 4. Lấy danh sách tất cả rooms

**GET** `/room`

#### cURL
```bash
curl -X GET http://localhost:3000/room \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### JavaScript (Fetch)
```javascript
const accessToken = localStorage.getItem('accessToken');

fetch('http://localhost:3000/room', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
})
  .then(res => res.json())
  .then(data => console.log('Rooms:', data));
```

#### Response
```json
[
  {
    "id": "uuid-1",
    "name": "General Chat",
    "description": "Main chat room",
    "avatar": "https://example.com/room1.jpg",
    "ownerId": "user-uuid-1"
  },
  {
    "id": "uuid-2",
    "name": "Tech Discussion",
    "description": "Discuss technology",
    "avatar": "https://example.com/room2.jpg",
    "ownerId": "user-uuid-2"
  }
]
```

---

### 5. Lấy thông tin room theo ID

**GET** `/room/:id`

#### cURL
```bash
curl -X GET http://localhost:3000/room/uuid-1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### JavaScript (Fetch)
```javascript
const roomId = 'uuid-1';
const accessToken = localStorage.getItem('accessToken');

fetch(`http://localhost:3000/room/${roomId}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
})
  .then(res => res.json())
  .then(data => console.log('Room:', data));
```

#### Response
```json
{
  "id": "uuid-1",
  "name": "General Chat",
  "description": "Main chat room",
  "avatar": "https://example.com/room1.jpg",
  "ownerId": "user-uuid-1"
}
```

---

### 6. Tạo room mới

**POST** `/room`

**Yêu cầu:** JWT Authentication (ownerId sẽ tự động lấy từ token)

#### cURL
```bash
curl -X POST http://localhost:3000/room \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Room",
    "description": "This is a new chat room",
    "avatar": "https://example.com/new-room.jpg"
  }'
```

#### JavaScript (Fetch)
```javascript
const accessToken = localStorage.getItem('accessToken');

fetch('http://localhost:3000/room', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'My New Room',
    description: 'This is a new chat room',
    avatar: 'https://example.com/new-room.jpg'
  })
})
  .then(res => res.json())
  .then(data => console.log('Created Room:', data));
```

#### Response
```json
{
  "id": "new-room-uuid",
  "name": "My New Room",
  "description": "This is a new chat room",
  "avatar": "https://example.com/new-room.jpg",
  "ownerId": "your-user-id"
}
```

---

### 7. Cập nhật room

**PATCH** `/room/:id`

**Yêu cầu:** 
- JWT Authentication
- Phải là chủ sở hữu của room (OwnershipGuard)

#### cURL
```bash
curl -X PATCH http://localhost:3000/room/uuid-1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Room Name",
    "description": "Updated description"
  }'
```

#### JavaScript (Fetch)
```javascript
const roomId = 'uuid-1';
const accessToken = localStorage.getItem('accessToken');

fetch(`http://localhost:3000/room/${roomId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Updated Room Name',
    description: 'Updated description'
    // avatar là optional
  })
})
  .then(res => res.json())
  .then(data => console.log('Updated Room:', data));
```

#### Response
```json
{
  "id": "uuid-1",
  "name": "Updated Room Name",
  "description": "Updated description",
  "avatar": "https://example.com/room1.jpg",
  "ownerId": "user-uuid-1"
}
```

---

### 8. Xóa room

**DELETE** `/room/:id`

**Yêu cầu:** 
- JWT Authentication
- Phải là chủ sở hữu của room (OwnershipGuard)

#### cURL
```bash
curl -X DELETE http://localhost:3000/room/uuid-1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### JavaScript (Fetch)
```javascript
const roomId = 'uuid-1';
const accessToken = localStorage.getItem('accessToken');

fetch(`http://localhost:3000/room/${roomId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
})
  .then(res => res.json())
  .then(data => console.log('Deleted:', data));
```

#### Response
```json
{
  "id": "uuid-1",
  "name": "General Chat",
  "description": "Main chat room",
  "avatar": "https://example.com/room1.jpg",
  "ownerId": "user-uuid-1"
}
```

---

## 📝 Ghi chú quan trọng

### Authentication Flow

1. **Đăng ký/Đăng nhập** → Nhận `accessToken` và `refreshToken`
2. **Lưu accessToken** → Dùng cho các request cần authentication
3. **Khi accessToken hết hạn** → Gọi `/auth/update` để lấy token mới
4. **Refresh token** → Tự động lưu trong cookie (httpOnly, secure)

### Headers cần thiết

- **Content-Type:** `application/json` (cho POST/PATCH)
- **Authorization:** `Bearer YOUR_ACCESS_TOKEN` (cho các protected endpoints)

### Error Responses

#### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "User under this username already exists",
  "error": "Bad Request"
}
```

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "You are not the owner of the room!"
}
```

#### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "There is no user under this username"
}
```

---

## 🧪 Test với Postman

### Collection Setup

1. Tạo Environment variables:
   - `base_url`: `http://localhost:3000`
   - `access_token`: (sẽ được set sau khi login)

2. Tạo Pre-request Script cho các protected endpoints:
```javascript
pm.request.headers.add({
  key: 'Authorization',
  value: 'Bearer ' + pm.environment.get('access_token')
});
```

3. Sau khi login thành công, set token:
```javascript
const response = pm.response.json();
pm.environment.set('access_token', response.accessToken);
```

---

## 🔌 WebSocket Events

Ngoài HTTP API, ứng dụng còn hỗ trợ WebSocket qua Socket.IO:

### Kết nối WebSocket
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  query: {
    token: 'YOUR_ACCESS_TOKEN'
  }
});
```

### Các events:
- `message` - Gửi/nhận tin nhắn
- `join` - Tham gia phòng
- `leave` - Rời phòng
- `user-kick` - Kick user (chủ phòng)
- `user-ban` - Ban user (chủ phòng)

Xem thêm trong file `src/chat/chat.gateway.ts`
