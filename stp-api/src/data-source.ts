import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './users/entities/user.entity';
import { Client } from './clients/entities/client.entity';
import { Project } from './projects/entities/project.entity';
import { Task } from './tasks/entities/task.entity';
import { Quote } from './quotes/entities/quote.entity';
import { QuoteItem } from './quotes/entities/quote-item.entity';
import { Expense } from './expenses/entities/expense.entity';
import { Payment } from './payments/entities/payment.entity';
import { Supplier } from './suppliers/entities/supplier.entity';
import { FileUpload } from './files/entities/file-upload.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Client, Project, Task, Quote, QuoteItem, Expense, Payment, Supplier, FileUpload, RefreshToken],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
