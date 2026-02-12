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

@Entity()
@Unique(['sensorConfigId', 'level'])
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

  @Column({ type: 'float', nullable: true })
  minThreshold: number;

  @Column({ type: 'float', nullable: true })
  maxThreshold: number;

  @Column({ type: 'varchar' })
  action: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
