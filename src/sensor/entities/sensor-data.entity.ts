import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

import { SensorType } from '../enums/sensor-type.enum';

@Entity()
@Index(['deviceId', 'createdAt'])
@Index(['deviceId', 'sensorType', 'createdAt'])
export class SensorData {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column('uuid')
  deviceId: string;

  @Column({
    type: 'enum',
    enum: SensorType,
  })
  sensorType: SensorType;

  @Column({ type: 'double precision' })
  value: number;

  @CreateDateColumn()
  createdAt: Date;
}
