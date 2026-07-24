import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlService } from './access-control.service';
import { MembershipsService } from './memberships.service';
import { ResourceAccessGuard } from '../guards/resource-access.guard';
import { ProjectMember } from '../../projects/entities/project-member.entity';
import { ClientMember } from '../../clients/entities/client-member.entity';
import { Project } from '../../projects/entities/project.entity';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { FileUpload } from '../../files/entities/file-upload.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { Ficha } from '../../fichas/entities/ficha.entity';

/**
 * Módulo global de autorización por pertenencia (RBAC granular).
 * Es global a propósito: cualquier controlador puede usar
 * `ResourceAccessGuard` sin tener que importar nada, para que no exista la
 * excusa de "se me olvidó importar el módulo" al proteger un endpoint.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectMember,
      ClientMember,
      Project,
      Client,
      User,
      FileUpload,
      Quote,
      Payment,
      Expense,
      Ficha,
    ]),
  ],
  providers: [AccessControlService, MembershipsService, ResourceAccessGuard],
  exports: [AccessControlService, MembershipsService, ResourceAccessGuard],
})
export class AccessModule {}
