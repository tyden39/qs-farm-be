import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Firmware } from './firmware.entity';
import { Device } from 'src/device/entities/device.entity';

export enum FirmwareUpdateStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  SUCCESS = 'success',
  FAILED = 'failed',
  ROLLBACK = 'rollback',
}

@Entity()
@Index(['deviceId', 'createdAt'])
export class FirmwareUpdateLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  firmwareId: string;

  @ManyToOne(() => Firmware)
  @JoinColumn({ name: 'firmwareId' })
  firmware: Firmware;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ length: 20, nullable: true })
  previousVersion: string;

  @Column({
    type: 'enum',
    enum: FirmwareUpdateStatus,
    default: FirmwareUpdateStatus.PENDING,
  })
  status: FirmwareUpdateStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'int', nullable: true })
  duration: number;

  @Column({ nullable: true })
  reportedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
