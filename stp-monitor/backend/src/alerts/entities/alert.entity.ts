import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() serviceId: string;
  @Column() serviceName: string;
  @Column() type: string;
  @Column({ type: 'text' }) message: string;
  @CreateDateColumn() createdAt: Date;
}
