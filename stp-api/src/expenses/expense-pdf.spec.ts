import {
  expensePdfFilename,
  expensePdfRelativeDir,
  expensePdfRelativePath,
} from './expense-pdf';

const EXPENSE = '9f1c0a1e-4d3b-4c2a-8f21-0b7d5e6a1234';
const CLIENT = '11111111-2222-3333-4444-555555555555';
const PROJECT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('expense-pdf', () => {
  describe('expensePdfFilename', () => {
    it('usa el id del gasto, que es lo único que no cambia al editarlo', () => {
      expect(expensePdfFilename(EXPENSE)).toBe(`GASTO-${EXPENSE}.pdf`);
    });

    it('da un nombre distinto por gasto: es la clave de búsqueda en uploaded_files', () => {
      expect(expensePdfFilename('a')).not.toBe(expensePdfFilename('b'));
    });

    it('es estable entre llamadas — generar, buscar y borrar tienen que coincidir', () => {
      expect(expensePdfFilename(EXPENSE)).toBe(expensePdfFilename(EXPENSE));
    });
  });

  describe('expensePdfRelativeDir', () => {
    it('sigue el árbol de almacenamiento del proyecto', () => {
      expect(expensePdfRelativeDir(CLIENT, PROJECT)).toBe(
        `clients/${CLIENT}/projects/${PROJECT}/expenses`,
      );
    });

    it('es relativa: nunca empieza en la raíz del disco', () => {
      expect(expensePdfRelativeDir(CLIENT, PROJECT).startsWith('/')).toBe(false);
    });
  });

  describe('expensePdfRelativePath', () => {
    it('compone carpeta + nombre', () => {
      expect(expensePdfRelativePath(CLIENT, PROJECT, EXPENSE)).toBe(
        `clients/${CLIENT}/projects/${PROJECT}/expenses/GASTO-${EXPENSE}.pdf`,
      );
    });

    it('cambia al mover el gasto de proyecto: por eso al regenerar hay que borrar el anterior', () => {
      const antes = expensePdfRelativePath(CLIENT, PROJECT, EXPENSE);
      const despues = expensePdfRelativePath(CLIENT, 'otro-proyecto', EXPENSE);
      expect(antes).not.toBe(despues);
    });
  });
});
