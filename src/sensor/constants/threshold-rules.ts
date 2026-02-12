import { SensorType } from '../enums/sensor-type.enum';

export const SENSOR_REASON_MAP: Record<SensorType, { belowMin: string; aboveMax: string }> = {
  [SensorType.SOIL_MOISTURE]: {
    belowMin: 'LOW_MOISTURE',
    aboveMax: 'HIGH_MOISTURE',
  },
  [SensorType.PUMP_TEMPERATURE]: {
    belowMin: 'LOW_TEMPERATURE',
    aboveMax: 'OVER_TEMPERATURE',
  },
  [SensorType.WATER_PRESSURE]: {
    belowMin: 'LOW_PRESSURE',
    aboveMax: 'HIGH_PRESSURE',
  },
  [SensorType.WATER_FLOW]: {
    belowMin: 'LOW_FLOW',
    aboveMax: 'HIGH_FLOW',
  },
  [SensorType.ELECTRICAL_CURRENT]: {
    belowMin: 'LOW_CURRENT',
    aboveMax: 'OVERCURRENT',
  },
};
