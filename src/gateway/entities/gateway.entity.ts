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

export enum GatewayStatus {
  PENDING = 'pending',
  PAIRED = 'paired',
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Entity()
export class Gateway {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  serial: string;

  @Column({ length: 50, nullable: true })
  hardwareVersion: string;

  @Column({ length: 20, nullable: true })
  firmwareVersion: string;

  @Column({ type: 'varchar', nullable: true })
  mqttToken: string;

  @Column({ type: 'enum', enum: GatewayStatus, default: GatewayStatus.PENDING })
  status: GatewayStatus;

  @Column('uuid', { nullable: true })
  farmId: string;

  @ManyToOne(() => Farm, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'farmId' })
  farm: Farm;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  // Provision state: nonce, pairingToken, expiry, used flag
  @Column({ nullable: true })
  nonce: string;

  @Column({ nullable: true })
  pairingToken: string;

  @Column({ type: 'timestamp', nullable: true })
  pairingTokenExpiresAt: Date;

  @Column({ default: false })
  pairingTokenUsed: boolean;

  @Column({ nullable: true })
  provisionedAt: Date;

  @Column({ nullable: true })
  pairedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
