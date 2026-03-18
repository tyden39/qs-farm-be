export enum PumpControlMode {
  AUTO = 'auto', // Tự động (qua ngưỡng cảm biến)
  MANUAL = 'manual', // Thủ công (qua REST API / WebSocket)
  SCHEDULE = 'schedule', // Lịch hẹn giờ
}
