import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';

@Entity()
@Index(['hardwareModel', 'version'])
export class Firmware {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  version: string;

  @Column({ length: 50 })
  hardwareModel: string;

  @Column({ length: 255 })
  fileName: string;

  @Column({ length: 255 })
  filePath: string;

  @Column('int')
  fileSize: number;

  @Column({ length: 64 })
  checksum: string;

  @Column({ type: 'text', nullable: true })
  releaseNotes: string;

  @Column({
    type: 'enum',
    enum: ['device', 'gateway'],
    default: 'device',
  })
  targetType: 'device' | 'gateway';

  @Column({ default: false })
  isPublished: boolean;

  @Column({ nullable: true })
  publishedAt: Date;

  @Column('uuid')
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
