import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';

import { Farm } from 'src/farm/entities/farm.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20 })
  username: string;

  @Column({ length: 60 })
  password: string;

  @Column({ type: 'varchar', default: '', nullable: true })
  avatar: string;

  @Column({ type: 'boolean', default: false })
  is_admin: boolean;

  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @OneToMany(() => Farm, (farm: Farm) => farm.user)
  farms: Array<Farm>;
}
