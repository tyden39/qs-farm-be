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

import { ZoneSensorConfig } from './zone-sensor-config.entity';
import { ThresholdLevel } from 'src/sensor/enums/threshold-level.enum';
import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';

@Entity()
@Unique(['zoneSensorConfigId', 'level', 'irrigationMode'])
export class ZoneThreshold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  zoneSensorConfigId: string;

  @ManyToOne(() => ZoneSensorConfig, (zsc) => zsc.thresholds, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'zoneSensorConfigId' })
  zoneSensorConfig: ZoneSensorConfig;

  @Column({ type: 'enum', enum: ThresholdLevel })
  level: ThresholdLevel;

  @Column({ type: 'enum', enum: IrrigationMode, nullable: true })
  irrigationMode: IrrigationMode;

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
