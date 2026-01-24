import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Farm } from 'src/farm/entities/farm.entity';

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

  @Column({ length: 50, nullable: true })
  hardwareVersion: string;

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

  @Column('uuid', { nullable: true })
  farmId: string;

  @ManyToOne(() => Farm, (farm: Farm) => farm.devices)
  @JoinColumn({ name: 'farmId' })
  farm: Farm;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
