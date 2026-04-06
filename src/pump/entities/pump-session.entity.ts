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
import { PumpSessionStatus } from '../enums/pump-session-status.enum';
import { InterruptedReason } from '../enums/interrupted-reason.enum';
import { PumpOperationMode } from '../enums/pump-operation-mode.enum';
import { PumpControlMode } from '../enums/pump-control-mode.enum';

@Entity()
@Index(['deviceId', 'startedAt'])
@Index(['deviceId', 'sessionNumber'])
export class PumpSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ type: 'int' })
  sessionNumber: number;

  // Irrigation mode (loại tưới: phun mưa, gốc cây, nhỏ giọt, thông thường)
  @Column({
    type: 'enum',
    enum: PumpOperationMode,
    default: PumpOperationMode.NORMAL,
  })
  irrigationMode: PumpOperationMode;

  // Control mode (nguồn điều khiển: thủ công, tự động, lịch hẹn)
  @Column({
    type: 'enum',
    enum: PumpControlMode,
    default: PumpControlMode.MANUAL,
  })
  controlMode: PumpControlMode;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date;

  @Column({ type: 'float', nullable: true })
  durationSeconds: number;

  // --- Temperature aggregates ---
  @Column({ type: 'float', nullable: true })
  tempMin: number;

  @Column({ type: 'float', nullable: true })
  tempMax: number;

  @Column({ type: 'float', nullable: true })
  tempAvg: number;

  // --- Pressure aggregates ---
  @Column({ type: 'float', nullable: true })
  pressureMin: number;

  @Column({ type: 'float', nullable: true })
  pressureMax: number;

  @Column({ type: 'float', nullable: true })
  pressureAvg: number;

  // --- Flow aggregates ---
  @Column({ type: 'float', nullable: true })
  flowMin: number;

  @Column({ type: 'float', nullable: true })
  flowMax: number;

  @Column({ type: 'float', nullable: true })
  flowTotal: number;

  // --- Current aggregates ---
  @Column({ type: 'float', nullable: true })
  currentMin: number;

  @Column({ type: 'float', nullable: true })
  currentMax: number;

  @Column({ type: 'float', nullable: true })
  currentAvg: number;

  // --- Phase count ---
  @Column({ type: 'int', default: 0 })
  phaseCount: number;

  // --- Overcurrent detection ---
  @Column({ type: 'boolean', default: false })
  overcurrentDetected: boolean;

  @Column({ type: 'int', default: 0 })
  overcurrentCount: number;

  @Column({ type: 'float', nullable: true })
  overcurrentMaxCurrent: number;

  // --- Alert flag ---
  @Column({ type: 'boolean', default: false })
  hasAlert: boolean;

  // --- Session status ---
  @Column({
    type: 'enum',
    enum: PumpSessionStatus,
    default: PumpSessionStatus.ACTIVE,
  })
  status: PumpSessionStatus;

  @Column({
    type: 'enum',
    enum: InterruptedReason,
    nullable: true,
  })
  interruptedReason: InterruptedReason;

  @CreateDateColumn()
  createdAt: Date;
}
