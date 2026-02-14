import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

import { SensorConfig } from './sensor-config.entity';
import { ThresholdLevel } from '../enums/threshold-level.enum';
import { ThresholdType } from '../enums/threshold-type.enum';

@Entity()
@Unique(['sensorConfigId', 'level', 'type'])
export class SensorThreshold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sensorConfigId: string;

  @ManyToOne(() => SensorConfig, (config) => config.thresholds, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sensorConfigId' })
  sensorConfig: SensorConfig;

  @Column({
    type: 'enum',
    enum: ThresholdLevel,
  })
  level: ThresholdLevel;

  @Column({
    type: 'enum',
    enum: ThresholdType,
  })
  type: ThresholdType;

  @Column({ type: 'float' })
  threshold: number;

  @Column({ type: 'varchar' })
  action: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
