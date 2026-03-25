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
import { FertilizerSessionStatus } from '../enums/fertilizer-session-status.enum';
import { FertilizerInterruptedReason } from '../enums/fertilizer-interrupted-reason.enum';
import { FertilizerControlMode } from '../enums/fertilizer-control-mode.enum';

@Entity()
@Index(['deviceId', 'startedAt'])
@Index(['deviceId', 'sessionNumber'])
export class FertilizerSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ type: 'int' })
  sessionNumber: number;

  // Control mode (nguồn điều khiển: thủ công, tự động, lịch hẹn)
  @Column({
    type: 'enum',
    enum: FertilizerControlMode,
    default: FertilizerControlMode.MANUAL,
  })
  controlMode: FertilizerControlMode;

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

  // --- Electrical current aggregates ---
  @Column({ type: 'float', nullable: true })
  currentMin: number;

  @Column({ type: 'float', nullable: true })
  currentMax: number;

  @Column({ type: 'float', nullable: true })
  currentAvg: number;

  // --- Phase count (distinct phase values) ---
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
    enum: FertilizerSessionStatus,
    default: FertilizerSessionStatus.ACTIVE,
  })
  status: FertilizerSessionStatus;

  @Column({
    type: 'enum',
    enum: FertilizerInterruptedReason,
    nullable: true,
  })
  interruptedReason: FertilizerInterruptedReason;

  @CreateDateColumn()
  createdAt: Date;
}
