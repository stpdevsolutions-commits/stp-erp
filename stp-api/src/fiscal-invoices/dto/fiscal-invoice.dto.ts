import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
  ValidateNested,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { clampLimit, clampPage } from '../../common/pagination';
import {
  EXPENSE_TYPE_CODES,
  NCF_ELECTRONIC,
  NCF_PAPER,
  PAYMENT_METHOD_CODES,
  normalizeNcf,
  normalizeRnc,
} from '../fiscal-invoice-rules';

const asNcf = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeNcf(value) : value;
const asRnc = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeRnc(value) : value;

const MONEY = { maxDecimalPlaces: 2 } as const;
const SECURITY_CODE = /^[A-Za-z0-9]{4,16}$/;
/** Tope de cordura (RD$100 millones) contra un cero de más al teclear. */
const MAX_MONEY = 100_000_000;

export class CreateFiscalInvoiceDto {
  @Transform(asNcf)
  @IsString()
  @Matches(new RegExp(`${NCF_PAPER.source}|${NCF_ELECTRONIC.source}`), {
    message: 'NCF no válido: B + tipo + 8 dígitos (papel) o E + tipo + 10 dígitos (electrónico)',
  })
  ncf: string;

  @Transform(asRnc)
  @Matches(/^(\d{9}|\d{11})$/, { message: 'El RNC debe tener 9 dígitos (o 11 si es cédula)' })
  supplierRnc: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  supplierName: string;

  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  baseAmount: number;

  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) itbis?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) isc?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) tip?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) otherTax?: number;

  /** Código del 606 (01–07); sin indicar, 01 efectivo. */
  @IsOptional()
  @IsIn(PAYMENT_METHOD_CODES)
  paymentMethod?: string;

  /** Código del 606 (01–11). */
  @IsIn(EXPENSE_TYPE_CODES)
  expenseType: string;

  @IsDateString()
  invoiceDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Código de seguridad del e-CF (del QR); solo aplica a comprobantes E31, E32… */
  @IsOptional()
  @Matches(SECURITY_CODE, { message: 'Código de seguridad no válido (4 a 16 letras o números)' })
  securityCode?: string;

  /**
   * A dónde va el gasto de esta factura (ERP-39): un proyecto (uuid), `null` = gasto
   * general de la empresa, o sin indicar = todavía sin gasto (cuenta solo para el 606).
   */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  /**
   * En vez de crear un gasto nuevo, vincula la factura a un gasto que ya estaba registrado a
   * mano (ERP-50). No se combina con `projectId`.
   */
  @IsOptional()
  @IsUUID()
  expenseId?: string;

  /** Con `expenseId`: poner en el gasto el monto, la fecha y el proveedor de la factura. */
  @IsOptional()
  @IsBoolean()
  syncExpense?: boolean;
}

export class UpdateFiscalInvoiceDto {
  @IsOptional()
  @Transform(asNcf)
  @IsString()
  @Matches(new RegExp(`${NCF_PAPER.source}|${NCF_ELECTRONIC.source}`), {
    message: 'NCF no válido: B + tipo + 8 dígitos (papel) o E + tipo + 10 dígitos (electrónico)',
  })
  ncf?: string;

  @IsOptional()
  @Transform(asRnc)
  @Matches(/^(\d{9}|\d{11})$/, { message: 'El RNC debe tener 9 dígitos (o 11 si es cédula)' })
  supplierRnc?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(255) supplierName?: string;

  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) baseAmount?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) itbis?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) isc?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) tip?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) otherTax?: number;

  @IsOptional() @IsIn(PAYMENT_METHOD_CODES) paymentMethod?: string;
  @IsOptional() @IsIn(EXPENSE_TYPE_CODES) expenseType?: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional()
  @Matches(SECURITY_CODE, { message: 'Código de seguridad no válido (4 a 16 letras o números)' })
  securityCode?: string;

  /** Igual que al crear; sin indicar, el gasto no cambia de destino. */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

/** Asigna varias facturas a un proyecto (uuid) o a gastos generales (`null`) de una vez. */
export class AssignFiscalInvoicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];

  /** Obligatorio: un uuid o `null` explícito (no se permite omitirlo). */
  @ValidateIf((o: AssignFiscalInvoicesDto) => o.projectId !== null)
  @IsUUID()
  projectId: string | null;
}

/** El texto del código QR de un e-CF (una dirección de la DGII). */
export class FromQrDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  text: string;
}

/** Opcional: si se manda, se usa y se guarda en la factura antes de consultar. */
export class ValidateDgiiDto {
  @IsOptional()
  @Matches(SECURITY_CODE, { message: 'Código de seguridad no válido (4 a 16 letras o números)' })
  codigoSeguridad?: string;
}

export class QueryFiscalInvoicesDto {
  /** Busca en NCF, RNC y nombre del emisor. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;

  @IsOptional()
  @IsIn(EXPENSE_TYPE_CODES)
  expenseType?: string;

  /**
   * `with` = facturas cuyo gasto está en un proyecto; `without` = gastos generales
   * (sin gasto, o con un gasto sin proyecto). Sin indicar, todas.
   */
  @IsOptional()
  @IsIn(['with', 'without'])
  project?: 'with' | 'without';

  /** Un proyecto concreto (los gastos enlazados a él). */
  @IsOptional() @IsUUID() projectId?: string;

  @IsOptional()
  @IsIn(PAYMENT_METHOD_CODES)
  paymentMethod?: string;

  /** Tipo de comprobante: B01, B02, E31… */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[BE]\d{2}$/)
  ncfType?: string;

  /**
   * Estado en la DGII: `pending` = nunca consultada; `valid` = Vigente/Aceptado;
   * `issue` = consultada con otro resultado (Rechazado, No encontrado…).
   */
  @IsOptional()
  @IsIn(['pending', 'valid', 'issue'])
  dgii?: 'pending' | 'valid' | 'issue';

  /** `assigned` = ya tiene gasto en el ERP; `unassigned` = todavía no. */
  @IsOptional()
  @IsIn(['assigned', 'unassigned'])
  assigned?: 'assigned' | 'unassigned';

  /** Con foto o PDF del comprobante adjunto (`yes`) o sin él (`no`). */
  @IsOptional()
  @IsIn(['yes', 'no'])
  hasPhoto?: 'yes' | 'no';

  @IsOptional() @Transform(({ value }) => (value === '' ? undefined : Number(value))) @IsNumber() @Min(0) amountMin?: number;
  @IsOptional() @Transform(({ value }) => (value === '' ? undefined : Number(value))) @IsNumber() @Min(0) amountMax?: number;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}

export class ValidatePendingDto {
  /** Cuántas consultar en esta tanda (la DGII se consulta una por una). */
  @IsOptional() @IsNumber() @Min(1) @Max(25) limit?: number;

  /** Ids que ya se intentaron y siguen sin resultado: se saltan para no repetirlas. */
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsUUID('4', { each: true }) exclude?: string[];
}

/** Datos de una factura (aún sin guardar) para buscarle un gasto ya registrado. */
export class ExpenseCandidatesQueryDto {
  @IsOptional()
  @Transform(asRnc)
  @IsString()
  @MaxLength(11)
  supplierRnc?: string;

  @IsOptional() @IsString() @MaxLength(255) supplierName?: string;

  @Type(() => Number) @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) totalAmount: number;

  @IsOptional() @Type(() => Number) @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) baseAmount?: number;

  @IsDateString()
  invoiceDate: string;
}

/** Vincula una factura a un gasto que ya existía. */
export class LinkExpenseDto {
  @IsUUID()
  expenseId: string;

  /** Poner en el gasto los datos de la factura (por defecto se respeta lo que ya tiene). */
  @IsOptional()
  @IsBoolean()
  syncExpense?: boolean;
}

export class LinkPairDto extends LinkExpenseDto {
  @IsUUID()
  invoiceId: string;
}

/** Confirma varias vinculaciones de la conciliación de una vez. */
export class ApplyLinksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LinkPairDto)
  pairs: LinkPairDto[];
}
