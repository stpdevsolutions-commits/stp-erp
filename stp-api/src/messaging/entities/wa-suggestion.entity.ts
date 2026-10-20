import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { WaContact } from './wa-contact.entity';

/** pending = esperando a una persona · sent · discarded · superseded (llegó algo más nuevo o ya contestó un humano) · failed (la IA no pudo). */
export type SuggestionStatus = 'pending' | 'sent' | 'discarded' | 'superseded' | 'failed';

/**
 * Sugerencia del copiloto de WhatsApp (ERP-56 fase 2): lo que la IA entendió de un mensaje del cliente y la
 * respuesta que propone. Nunca se envía sola: una persona la revisa, la edita si quiere y la envía o la descarta.
 */
@Entity('wa_suggestions')
@Index('IDX_wa_suggestions_contact_createdAt', ['contactId', 'createdAt'])
export class WaSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WaContact, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'contactId' })
  contact: WaContact;

  @Column({ type: 'uuid' })
  contactId: string;

  /** Mensaje entrante que se analizó (el último de la tanda). */
  @Column({ type: 'uuid', nullable: true, unique: true })
  triggerMessageId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SuggestionStatus;

  /** responder | derivar | ninguna */
  @Column({ type: 'varchar', length: 20, default: 'ninguna' })
  kind: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  category: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  service: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  lead: { name: string | null; location: string | null; details: string | null };

  @Column({ type: 'jsonb', default: () => `'[]'` })
  missing: string[];

  @Column({ default: false })
  escalate: boolean;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  escalationReasons: string[];

  /** Respuesta propuesta, ya filtrada por las reglas duras; null si solo se deriva. */
  @Column({ type: 'text', nullable: true })
  reply: string | null;

  @Column({ type: 'real', default: 0 })
  confidence: number;

  /** Reglas duras que intervinieron (auditoría). */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  flags: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ default: false })
  edited: boolean;

  @Column({ type: 'uuid', nullable: true })
  resolvedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  sentMessageId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
