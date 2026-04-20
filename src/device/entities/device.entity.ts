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
import { SensorConfig } from 'src/sensor/entities/sensor-config.entity';
import { IrrigationMode } from 'src/shared/enums/irrigation-mode.enum';
import { ControlMode } from 'src/shared/enums/control-mode.enum';
import type { Zone } from 'src/zone/entities/zone.entity';

export enum DeviceStatus {
  PENDING = 'pending',
  PAIRED = 'paired',
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Entity()
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', default: '', nullable: true })
  image: string;

  @Column({ length: 50, unique: true })
  imei: string;

  @Column({ length: 100, unique: true, nullable: true })
  serial: string;

  @Column({ length: 17, unique: true, nullable: true })
  mac: string;

  @Column({ length: 50, nullable: true })
  hardwareVersion: string;

  @Column({ length: 50, nullable: true })
  hwModel: string;

  @Column({ length: 20, nullable: true })
  firmwareVersion: string;

  @Column({ type: 'varchar', nullable: true })
  deviceToken: string;

  @Column({
    type: 'enum',
    enum: DeviceStatus,
    default: DeviceStatus.PENDING,
  })
  status: DeviceStatus;

  @Column({ nullable: true })
  provisionedAt: Date;

  @Column({ nullable: true })
  pairedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date;

  // Gateway that this device connects through (null = direct WiFi)
  @Column('uuid', { nullable: true })
  gatewayId: string;

  @ManyToOne('Gateway', (gw: any) => gw.devices, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gatewayId' })
  gateway: any;

  @Column({ type: 'float', nullable: true })
  operatingLifeHours: number;

  @Column({ type: 'float', default: 0 })
  totalOperatingHours: number;

  @Column('uuid', { nullable: true })
  farmId: string;

  @ManyToOne(() => Farm, (farm: Farm) => farm.devices)
  @JoinColumn({ name: 'farmId' })
  farm: Farm;

  @Column('uuid', { nullable: true })
  zoneId: string;

  @ManyToOne('Zone', (zone: any) => zone.devices, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'zoneId' })
  zone: Zone;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ type: 'enum', enum: IrrigationMode, nullable: true })
  irrigationMode: IrrigationMode;

  @Column({ type: 'enum', enum: ControlMode, nullable: true })
  controlMode: ControlMode;

  @Column({ type: 'boolean', default: false })
  pumpEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  hasFertilizer: boolean;

  @Column({ type: 'boolean', default: false })
  fertilizerEnabled: boolean;

  @OneToMany(() => SensorConfig, (sc) => sc.device)
  sensorConfigs: SensorConfig[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
