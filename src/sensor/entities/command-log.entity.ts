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

export enum CommandSource {
  MANUAL = 'manual',
  AUTOMATED = 'automated',
}

@Entity()
@Index(['deviceId', 'createdAt'])
export class CommandLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ type: 'varchar' })
  command: string;

  @Column({ type: 'jsonb', nullable: true })
  params: any;

  @Column({
    type: 'enum',
    enum: CommandSource,
  })
  source: CommandSource;

  @Column({ type: 'varchar', nullable: true })
  sensorType: string;

  @Column({ type: 'varchar', nullable: true })
  reason: string;

  @Column({ type: 'boolean', default: true })
  success: boolean;

  @Column({ type: 'varchar', nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}
