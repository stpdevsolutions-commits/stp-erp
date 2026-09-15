import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { auditLog } from '../common/audit-log';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(page = 1, limit = 20) {
    const [data, total] = await this.usersRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  count(): Promise<number> {
    return this.usersRepository.count();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByIdOptional(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    opts?: { role?: UserRole; phone?: string; isActive?: boolean },
  ): Promise<User> {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) throw new ConflictException('Email already registered');
    const hashed = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      email: normalizedEmail,
      password: hashed,
      firstName,
      lastName,
      ...opts,
    });
    return this.usersRepository.save(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<User> {
    const user = await this.findById(id);
    const isSelf = id === requesterId;
    const isAdmin = requesterRole === UserRole.ADMIN;

    if (!isSelf && !isAdmin) throw new ForbiddenException('Access denied');
    if (!isAdmin && (dto.role !== undefined || dto.isActive !== undefined)) {
      throw new ForbiddenException('Only admins can change role or status');
    }

    // Sin esto, un ADMIN puede quitarse el rol a sí mismo (o a cualquier
    // otro) hasta dejar el ERP sin ningún administrador activo — solo se
    // recupera de eso entrando directo a la base de datos.
    const wouldLoseAdmin =
      user.role === UserRole.ADMIN &&
      user.isActive &&
      ((dto.role !== undefined && dto.role !== UserRole.ADMIN) || dto.isActive === false);
    if (wouldLoseAdmin) {
      await this.assertNotLastActiveAdmin(id);
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    if (dto.role !== undefined || dto.isActive !== undefined) {
      auditLog(requesterId, 'user.role_or_status_changed', {
        targetUserId: id,
        role: dto.role,
        isActive: dto.isActive,
      });
    }
    Object.assign(user, defined);
    return this.usersRepository.save(user);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.findById(id);
    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
  }

  async remove(id: string, requesterId?: string): Promise<void> {
    const user = await this.findById(id);
    if (user.role === UserRole.ADMIN && user.isActive) {
      await this.assertNotLastActiveAdmin(id);
    }
    auditLog(requesterId, 'user.deactivated', { targetUserId: id, email: user.email });
    user.isActive = false;
    await this.usersRepository.save(user);
  }

  /** Lanza si `id` es el único administrador activo restante. */
  private async assertNotLastActiveAdmin(id: string): Promise<void> {
    const otherActiveAdmins = await this.usersRepository.count({
      where: { role: UserRole.ADMIN, isActive: true, id: Not(id) },
    });
    if (otherActiveAdmins === 0) {
      throw new ConflictException(
        'No se puede quitar el rol de administrador ni desactivar al único administrador activo del sistema',
      );
    }
  }
}
