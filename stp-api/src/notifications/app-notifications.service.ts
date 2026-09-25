import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { User, UserRole } from '../users/entities/user.entity';

const LIMIT = 20;

/**
 * Feed de notificaciones in-app (ERP-107). Nunca lanza al notificar — un
 * fallo acá no debe tumbar la acción de negocio que la disparó (crear una
 * tarea, aprobar una cotización...), mismo criterio que WhatsappService.
 */
@Injectable()
export class AppNotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async notifyUser(
    userId: string,
    type: NotificationType,
    title: string,
    message?: string,
    link?: string,
  ): Promise<void> {
    try {
      const n = this.repo.create({ userId, type, title, message, link });
      await this.repo.save(n);
    } catch {
      // Silenciado a propósito: ver comentario de clase.
    }
  }

  /** Ej.: pago recibido → avisa a todo admin/finanza, no a una persona puntual. */
  async notifyRoles(
    roles: UserRole[],
    type: NotificationType,
    title: string,
    message?: string,
    link?: string,
  ): Promise<void> {
    try {
      const users = await this.usersRepo.find({ where: roles.map((role) => ({ role })) });
      if (users.length === 0) return;
      const rows = users.map((u) => this.repo.create({ userId: u.id, type, title, message, link }));
      await this.repo.save(rows);
    } catch {
      // Silenciado a propósito: ver comentario de clase.
    }
  }

  async findForUser(userId: string, page = 1) {
    const [data, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    });
    return { data, total, page, limit: LIMIT };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, read: false } });
  }

  async markRead(id: string, userId: string): Promise<void> {
    const n = await this.repo.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Notification not found');
    if (n.userId !== userId) throw new ForbiddenException();
    if (n.read) return;
    n.read = true;
    n.readAt = new Date();
    await this.repo.save(n);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.update({ userId, read: false }, { read: true, readAt: new Date() });
  }
}
