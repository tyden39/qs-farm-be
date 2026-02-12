import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Device } from 'src/device/entities/device.entity';
import { Farm } from 'src/farm/entities/farm.entity';

export enum ScheduleType {
  RECURRING = 'recurring',
  ONE_TIME = 'one_time',
}

@Entity()
export class DeviceSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: ScheduleType,
  })
  type: ScheduleType;

  @Column('uuid', { nullable: true })
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column('uuid', { nullable: true })
  farmId: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farmId' })
  farm: Farm;

  @Column({ length: 100 })
  command: string;

  @Column({ type: 'jsonb', default: {} })
  params: Record<string, any>;

  @Column('int', { array: true, nullable: true })
  daysOfWeek: number[];

  @Column({ type: 'varchar', length: 5, nullable: true })
  time: string;

  @Column({ type: 'timestamptz', nullable: true })
  executeAt: Date;

  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastExecutedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
