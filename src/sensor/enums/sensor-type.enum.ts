export enum SensorType {
  WATER_PRESSURE = 'water_pressure',
  WATER_FLOW = 'water_flow',
  PUMP_TEMPERATURE = 'pump_temperature',
  SOIL_MOISTURE = 'soil_moisture',
  ELECTRICAL_CURRENT = 'electrical_current',
}

export const PAYLOAD_TO_SENSOR_TYPE: Record<string, SensorType> = {
  pressure: SensorType.WATER_PRESSURE,
  flow: SensorType.WATER_FLOW,
  temperature: SensorType.PUMP_TEMPERATURE,
  soilMoisture: SensorType.SOIL_MOISTURE,
  current: SensorType.ELECTRICAL_CURRENT,
};
