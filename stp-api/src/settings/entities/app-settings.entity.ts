import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn() key: string;
  @Column({ type: 'text', nullable: true }) value: string;
  @UpdateDateColumn() updatedAt: Date;
}
