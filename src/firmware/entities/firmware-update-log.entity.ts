import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
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

  // Plain UUID reference — no FK constraint so logs survive firmware deletion
  @Column({ type: 'uuid', nullable: true })
  firmwareId: string | null;

  // Snapshot of firmware version at time of update — preserved even if firmware is deleted
  @Column({ length: 20, nullable: true })
  firmwareVersion: string | null;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  // Set when OTA targets a gateway
  @Column({ type: 'uuid', nullable: true })
  gatewayId: string | null;

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
