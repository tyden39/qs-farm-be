export enum SensorType {
  WATER_PRESSURE = 'water_pressure',
  WATER_FLOW = 'water_flow',
  PUMP_TEMPERATURE = 'pump_temperature',
  SOIL_MOISTURE = 'soil_moisture',
  ELECTRICAL_CURRENT = 'electrical_current',
  ELECTRICAL_PHASE = 'electrical_phase',
}

export const SENSOR_TYPE_LABEL: Record<SensorType, string> = {
  [SensorType.WATER_PRESSURE]: 'Áp suất nước',
  [SensorType.WATER_FLOW]: 'Lưu lượng nước',
  [SensorType.PUMP_TEMPERATURE]: 'Nhiệt độ máy bơm',
  [SensorType.SOIL_MOISTURE]: 'Độ ẩm đất',
  [SensorType.ELECTRICAL_CURRENT]: 'Dòng điện',
  [SensorType.ELECTRICAL_PHASE]: 'Pha điện',
};

export const PAYLOAD_TO_SENSOR_TYPE: Record<string, SensorType> = {
  pressure: SensorType.WATER_PRESSURE,
  flow: SensorType.WATER_FLOW,
  temperature: SensorType.PUMP_TEMPERATURE,
  soilMoisture: SensorType.SOIL_MOISTURE,
  current: SensorType.ELECTRICAL_CURRENT,
  phase: SensorType.ELECTRICAL_PHASE,
};
