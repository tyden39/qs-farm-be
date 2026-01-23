import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { User } from 'src/user/entities/user.entity';
import { Device } from 'src/device/entities/device.entity';

@Entity()
export class Farm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', default: '', nullable: true })
  image: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user: User) => user.farms)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Device, (device: Device) => device.farm)
  devices: Array<Device>;
}
