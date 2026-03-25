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
  [SensorType.PUMP_STATUS]: {
    belowMin: 'Trạng thái bơm thấp',
    aboveMax: 'Trạng thái bơm cao',
  },
  [SensorType.FERT_TEMPERATURE]: {
    belowMin: 'Nhiệt độ máy phân thấp',
    aboveMax: 'Nhiệt độ máy phân quá cao',
  },
  [SensorType.FERT_CURRENT]: {
    belowMin: 'Dòng điện máy phân thấp',
    aboveMax: 'Quá dòng điện máy phân',
  },
  [SensorType.FERT_PHASE]: {
    belowMin: 'Lỗi pha điện máy phân',
    aboveMax: 'Quá điện áp pha máy phân',
  },
  [SensorType.FERT_STATUS]: {
    belowMin: 'Trạng thái máy phân thấp',
    aboveMax: 'Trạng thái máy phân cao',
  },
};
