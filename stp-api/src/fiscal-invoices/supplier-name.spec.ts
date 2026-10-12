import { chooseSupplierName, foldName } from './supplier-name';

describe('foldName', () => {
  it('ignora tildes, mayúsculas y puntuación', () => {
    expect(foldName('CIELOS ACUSTICOS, SRL')).toBe(foldName('Cielos Acústicos, SRL'));
    expect(foldName('  Ferretería   Ñandú ')).toBe('ferreteria nandu');
  });
});

describe('chooseSupplierName', () => {
  it('el mismo nombre con otra escritura: gana el que lleva tildes y minúsculas', () => {
    expect(chooseSupplierName('Cielos Acústicos, SRL', ['CIELOS ACUSTICOS, SRL'])).toBe('Cielos Acústicos, SRL');
  });

  it('y al revés: si el ERP ya tiene el bueno, no lo pisa el mayúsculas sin tildes', () => {
    expect(chooseSupplierName('CIELOS ACUSTICOS, SRL', ['Cielos Acústicos, SRL'])).toBe('Cielos Acústicos, SRL');
  });

  it('a igualdad, se queda el que el ERP ya tenía', () => {
    expect(chooseSupplierName('ferretería lópez', ['Ferretería López'])).toBe('Ferretería López');
  });

  it('un nombre distinto se respeta (cambio de razón social)', () => {
    expect(chooseSupplierName('Acústica Nueva SRL', ['Cielos Acústicos, SRL'])).toBe('Acústica Nueva SRL');
  });

  it('sin lectura, usa el primero que el ERP conoce; sin nada, vacío', () => {
    expect(chooseSupplierName('', ['Ferretería López', 'FERRETERIA LOPEZ'])).toBe('Ferretería López');
    expect(chooseSupplierName('', [])).toBe('');
  });

  it('limpia espacios de más', () => {
    expect(chooseSupplierName('  Cielos   Acústicos, SRL ', [])).toBe('Cielos Acústicos, SRL');
  });
});
