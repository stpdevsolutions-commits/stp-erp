export type CompanyData = {
  name: string;
  /** Razón social tal como consta en el RNC (la pide la representación impresa del e-CF). */
  legalName?: string;
  shortName: string;
  rnc: string;
  address1: string;
  address2: string;
  phones: string;
  email: string;
  website: string;
};

export const COMPANY: CompanyData = {
  name: 'Soluciones Técnicas Profesionales',
  legalName: 'SOLUCIONES TECNICAS PROFESIONALES STP SRL',
  shortName: 'STP',
  rnc: '132943058',
  address1: 'Calle Bonanza #58, Loyola, Herrera',
  address2: 'Santo Domingo Oeste, República Dominicana',
  phones: '809-537-6566 / 809-350-9162',
  email: 'proyectos@stpsoluciones.com',
  website: 'stpsoluciones.com',
};
