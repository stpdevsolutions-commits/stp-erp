import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { phoneNormalizedSql } from '../../common/phone-normalized';

export enum ClientType {
  COMPANY = 'company',
  INDIVIDUAL = 'individual',
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ClientType, default: ClientType.COMPANY })
  type: ClientType;

  @Column({ type: 'varchar', nullable: true, unique: true })
  rnc: string;

  @Column({ type: 'varchar', nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  /** Teléfono en solo dígitos con código de país, generado por Postgres (ERP-75). */
  @Index('IDX_clients_phoneNormalized')
  @Column({ type: 'varchar', nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: phoneNormalizedSql('phone') })
  phoneNormalized: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string;

  @Column({ type: 'varchar', nullable: true })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  contactName: string;

  @Column({ type: 'varchar', nullable: true })
  contactPhone: string;

  @Index('IDX_clients_contactPhoneNormalized')
  @Column({ type: 'varchar', nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: phoneNormalizedSql('contactPhone') })
  contactPhoneNormalized: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
