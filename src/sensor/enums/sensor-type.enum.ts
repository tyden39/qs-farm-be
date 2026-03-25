export enum SensorType {
  // --- Pump sensors ---
  WATER_PRESSURE = 'water_pressure',
  WATER_FLOW = 'water_flow',
  PUMP_TEMPERATURE = 'pump_temperature',
  SOIL_MOISTURE = 'soil_moisture',
  ELECTRICAL_CURRENT = 'electrical_current',
  ELECTRICAL_PHASE = 'electrical_phase',
  PUMP_STATUS = 'pump_status',

  // --- Fertilizer sensors (same ESP device, different payload keys) ---
  FERT_TEMPERATURE = 'fert_temperature',
  FERT_CURRENT = 'fert_current',
  FERT_PHASE = 'fert_phase',
  FERT_STATUS = 'fert_status',
}

export const SENSOR_TYPE_LABEL: Record<SensorType, string> = {
  [SensorType.WATER_PRESSURE]: 'Áp suất nước',
  [SensorType.WATER_FLOW]: 'Lưu lượng nước',
  [SensorType.PUMP_TEMPERATURE]: 'Nhiệt độ máy bơm',
  [SensorType.SOIL_MOISTURE]: 'Độ ẩm đất',
  [SensorType.ELECTRICAL_CURRENT]: 'Dòng điện',
  [SensorType.ELECTRICAL_PHASE]: 'Pha điện',
  [SensorType.PUMP_STATUS]: 'Trạng thái bơm',
  [SensorType.FERT_TEMPERATURE]: 'Nhiệt độ máy phân',
  [SensorType.FERT_CURRENT]: 'Dòng điện máy phân',
  [SensorType.FERT_PHASE]: 'Pha điện máy phân',
  [SensorType.FERT_STATUS]: 'Trạng thái máy phân',
};

export const PAYLOAD_TO_SENSOR_TYPE: Record<string, SensorType> = {
  // Pump payload keys
  pressure: SensorType.WATER_PRESSURE,
  flow: SensorType.WATER_FLOW,
  temperature: SensorType.PUMP_TEMPERATURE,
  soilMoisture: SensorType.SOIL_MOISTURE,
  current: SensorType.ELECTRICAL_CURRENT,
  phase: SensorType.ELECTRICAL_PHASE,
  pumpStatus: SensorType.PUMP_STATUS,
  // Fertilizer payload keys (prefixed with 'fert' to avoid collision)
  fertTemperature: SensorType.FERT_TEMPERATURE,
  fertCurrent: SensorType.FERT_CURRENT,
  fertPhase: SensorType.FERT_PHASE,
  fertStatus: SensorType.FERT_STATUS,
};
