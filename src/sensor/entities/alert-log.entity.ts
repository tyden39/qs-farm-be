import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';

import { Device } from 'src/device/entities/device.entity';
import { SensorType } from '../enums/sensor-type.enum';
import { ThresholdLevel } from '../enums/threshold-level.enum';

export enum AlertDirection {
  ABOVE = 'above',
  BELOW = 'below',
}

@Entity()
export class AlertLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({
    type: 'enum',
    enum: SensorType,
  })
  sensorType: SensorType;

  @Column({ type: 'float' })
  value: number;

  @Column({ type: 'float' })
  threshold: number;

  @Column({
    type: 'enum',
    enum: ThresholdLevel,
  })
  level: ThresholdLevel;

  @Column({
    type: 'enum',
    enum: AlertDirection,
  })
  direction: AlertDirection;

  @Column({ type: 'varchar', nullable: true })
  action: string;

  @Column({ type: 'varchar' })
  reason: string;

  @Column({ type: 'boolean', default: false })
  acknowledged: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
