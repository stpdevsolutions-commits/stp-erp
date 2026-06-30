import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('service_checks')
export class ServiceCheck {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() serviceId: string;
  @Column() name: string;
  @Column() url: string;
  @Column({ default: 'http' }) type: string;
  @Column({ default: 'unknown' }) status: string;
  @Column({ type: 'float', nullable: true }) latency: number;
  @CreateDateColumn() checkedAt: Date;
}
