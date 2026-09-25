import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { CollaboratorLoan, CollaboratorLoanStatus } from './entities/collaborator-loan.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { CreateCollaboratorLoanDto } from './dto/create-collaborator-loan.dto';
import { UpdateCollaboratorLoanDto } from './dto/update-collaborator-loan.dto';
import { QueryCollaboratorLoansDto } from './dto/query-collaborator-loans.dto';

@Injectable()
export class CollaboratorLoansService {
  constructor(
    @InjectRepository(CollaboratorLoan)
    private readonly loansRepository: Repository<CollaboratorLoan>,
    @InjectRepository(Collaborator)
    private readonly collaboratorsRepository: Repository<Collaborator>,
  ) {}

  async findAll(query: QueryCollaboratorLoansDto) {
    const { collaboratorId, status, page = 1, limit = 20 } = query;

    const where: FindOptionsWhere<CollaboratorLoan> = {};
    if (collaboratorId) where.collaboratorId = collaboratorId;
    if (status) where.status = status;

    const [data, total] = await this.loansRepository.findAndCount({
      where,
      relations: { collaborator: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<CollaboratorLoan> {
    const loan = await this.loansRepository.findOne({
      where: { id },
      relations: { collaborator: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }

  async create(dto: CreateCollaboratorLoanDto): Promise<CollaboratorLoan> {
    const exists = await this.collaboratorsRepository.existsBy({ id: dto.collaboratorId });
    if (!exists) throw new BadRequestException(`Collaborator ${dto.collaboratorId} not found`);

    const loan = this.loansRepository.create({
      ...dto,
      balance: dto.amount,
      status: CollaboratorLoanStatus.ACTIVE,
    });
    return this.loansRepository.save(loan);
  }

  async update(id: string, dto: UpdateCollaboratorLoanDto): Promise<CollaboratorLoan> {
    const loan = await this.findOne(id);
    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(loan, defined);
    return this.loansRepository.save(loan);
  }

  /**
   * Próximo préstamo activo con saldo del colaborador (FIFO por fecha de
   * creación). Usado por PayrollService al generar cada pago (ERP-91).
   */
  async findActiveForCollaborator(collaboratorId: string): Promise<CollaboratorLoan | null> {
    return this.loansRepository.findOne({
      where: { collaboratorId, status: CollaboratorLoanStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });
  }

  /** Aplica una cuota: descuenta del saldo y marca pagado si llega a cero. */
  async applyInstallment(loan: CollaboratorLoan, amount: number): Promise<void> {
    loan.balance = Math.round((loan.balance - amount) * 100) / 100;
    if (loan.balance <= 0) {
      loan.balance = 0;
      loan.status = CollaboratorLoanStatus.PAID;
    }
    await this.loansRepository.save(loan);
  }

  /** Revierte una cuota (al borrar el pago de nómina que la aplicó). */
  async refundInstallment(loanId: string, amount: number): Promise<void> {
    const loan = await this.loansRepository.findOne({ where: { id: loanId } });
    if (!loan) return;
    loan.balance = Math.round((loan.balance + amount) * 100) / 100;
    if (loan.status === CollaboratorLoanStatus.PAID && loan.balance > 0) {
      loan.status = CollaboratorLoanStatus.ACTIVE;
    }
    await this.loansRepository.save(loan);
  }
}
