import {
  REVISABLE_STATUSES,
  isRevisableStatus,
  revisionNumber,
  revisionLabel,
} from './quote-revision';
import { QuoteStatus } from './entities/quote.entity';

describe('quote-revision', () => {
  describe('isRevisableStatus', () => {
    it('permite revisar sent/approved/rejected/expired', () => {
      expect(isRevisableStatus(QuoteStatus.SENT)).toBe(true);
      expect(isRevisableStatus(QuoteStatus.APPROVED)).toBe(true);
      expect(isRevisableStatus(QuoteStatus.REJECTED)).toBe(true);
      expect(isRevisableStatus(QuoteStatus.EXPIRED)).toBe(true);
    });

    it('NO permite revisar una DRAFT (se edita directamente)', () => {
      expect(isRevisableStatus(QuoteStatus.DRAFT)).toBe(false);
    });

    it('REVISABLE_STATUSES no incluye DRAFT', () => {
      expect(REVISABLE_STATUSES).not.toContain(QuoteStatus.DRAFT);
    });
  });

  describe('revisionNumber', () => {
    it('la original (rev 1) conserva el número base tal cual', () => {
      expect(revisionNumber('COT-2026-001', 1)).toBe('COT-2026-001');
    });

    it('las revisiones N>1 añaden el sufijo -R{N}', () => {
      expect(revisionNumber('COT-2026-001', 2)).toBe('COT-2026-001-R2');
      expect(revisionNumber('COT-2026-001', 3)).toBe('COT-2026-001-R3');
    });

    it('el sufijo no altera SPLIT_PART(number, "-", 3) = secuencia', () => {
      // generateNumber() para cotizaciones NUEVAS extrae la 3ª parte del número.
      const seq = (n: string) => n.split('-')[2];
      expect(seq(revisionNumber('COT-2026-007', 1))).toBe('007');
      expect(seq(revisionNumber('COT-2026-007', 4))).toBe('007');
    });
  });

  describe('revisionLabel', () => {
    it('vacío para la original, "Rev. N" para revisiones', () => {
      expect(revisionLabel(1)).toBe('');
      expect(revisionLabel(2)).toBe('Rev. 2');
    });
  });
});
