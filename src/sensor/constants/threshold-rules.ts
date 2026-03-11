import { SensorType } from '../enums/sensor-type.enum';

export const SENSOR_REASON_MAP: Record<
  SensorType,
  { belowMin: string; aboveMax: string }
> = {
  [SensorType.SOIL_MOISTURE]: {
    belowMin: 'Độ ẩm đất thấp',
    aboveMax: 'Độ ẩm đất cao',
  },
  [SensorType.PUMP_TEMPERATURE]: {
    belowMin: 'Nhiệt độ máy bơm thấp',
    aboveMax: 'Nhiệt độ máy bơm quá cao',
  },
  [SensorType.WATER_PRESSURE]: {
    belowMin: 'Áp suất nước thấp',
    aboveMax: 'Áp suất nước cao',
  },
  [SensorType.WATER_FLOW]: {
    belowMin: 'Lưu lượng nước thấp',
    aboveMax: 'Lưu lượng nước cao',
  },
  [SensorType.ELECTRICAL_CURRENT]: {
    belowMin: 'Dòng điện thấp',
    aboveMax: 'Quá dòng điện',
  },
  [SensorType.ELECTRICAL_PHASE]: {
    belowMin: 'Lỗi pha điện',
    aboveMax: 'Quá điện áp pha',
  },
};
