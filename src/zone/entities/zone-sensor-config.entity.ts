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

import { Zone } from './zone.entity';
import { ZoneThreshold } from './zone-threshold.entity';
import { SensorType } from 'src/sensor/enums/sensor-type.enum';
import { SensorMode } from 'src/sensor/enums/sensor-mode.enum';

@Entity()
@Unique(['zoneId', 'sensorType'])
export class ZoneSensorConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  zoneId: string;

  @ManyToOne(() => Zone, (zone) => zone.sensorConfigs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zoneId' })
  zone: Zone;

  @Column({ type: 'enum', enum: SensorType })
  sensorType: SensorType;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'enum', enum: SensorMode, default: SensorMode.AUTO })
  mode: SensorMode;

  @Column({ type: 'varchar', nullable: true })
  unit: string;

  @OneToMany(() => ZoneThreshold, (zt) => zt.zoneSensorConfig, { cascade: true })
  thresholds: ZoneThreshold[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
