import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Farm } from 'src/farm/entities/farm.entity';
import { Device } from 'src/device/entities/device.entity';
import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';
import { ControlMode } from 'src/shared/enums/control-mode.enum';
import { ZoneSensorConfig } from './zone-sensor-config.entity';

@Entity()
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', default: '', nullable: true })
  image: string;

  @Column('uuid')
  farmId: string;

  @ManyToOne(() => Farm, (farm) => farm.zones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farmId' })
  farm: Farm;

  @Column({ type: 'jsonb', default: [] })
  coordinates: { lat: number; lng: number }[];

  @Column({ type: 'enum', enum: IrrigationMode, default: IrrigationMode.NORMAL })
  irrigationMode: IrrigationMode;

  @Column({ type: 'enum', enum: ControlMode, default: ControlMode.MANUAL })
  controlMode: ControlMode;

  @Column({ type: 'boolean', default: false })
  checkAll: boolean;

  @Column({ type: 'boolean', default: false })
  pumpEnabled: boolean;

  @OneToMany(() => Device, (device) => device.zone)
  devices: Device[];

  @OneToMany(() => ZoneSensorConfig, (zsc) => zsc.zone)
  sensorConfigs: ZoneSensorConfig[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
