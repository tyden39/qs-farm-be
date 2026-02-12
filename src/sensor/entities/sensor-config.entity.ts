import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

import { Device } from 'src/device/entities/device.entity';
import { SensorType } from '../enums/sensor-type.enum';
import { SensorMode } from '../enums/sensor-mode.enum';
import { SensorThreshold } from './sensor-threshold.entity';

@Entity()
@Unique(['deviceId', 'sensorType'])
export class SensorConfig {
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

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({
    type: 'enum',
    enum: SensorMode,
    default: SensorMode.AUTO,
  })
  mode: SensorMode;

  @Column({ type: 'varchar', nullable: true })
  unit: string;

  @OneToMany(() => SensorThreshold, (threshold) => threshold.sensorConfig, {
    cascade: true,
  })
  thresholds: SensorThreshold[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
