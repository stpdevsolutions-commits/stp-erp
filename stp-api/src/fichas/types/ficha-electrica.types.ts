export interface Tablero {
  id: string;
  nombre: string;
  tipo: 'principal' | 'secundario' | 'distribucion' | 'otro';
  amperaje: number;
  voltaje: '120V' | '240V' | '480V' | 'otro';
  fases: 'monofasico' | 'bifasico' | 'trifasico';
  estado: 'bueno' | 'regular' | 'malo' | 'nuevo';
  observaciones?: string;
}

export interface Circuito {
  numero: string;
  descripcion: string;
  tableroId?: string;
  breakerA: number;
  calibreAWG: string;
  longitud?: number;
  tipo: 'iluminacion' | 'tomacorriente' | 'hvac' | 'motor' | 'especial' | 'otro';
  estado: 'activo' | 'inactivo' | 'nuevo' | 'reemplazar';
  observaciones?: string;
}

export interface Material {
  descripcion: string;
  unidad: 'unidad' | 'metro' | 'caja' | 'rollo' | 'par' | 'otro';
  cantidad: number;
  observaciones?: string;
}

export interface Mediciones {
  voltajeL1L2?: number;
  voltajeL1N?: number;
  voltajeL2N?: number;
  corrienteTotal?: number;
  factorPotencia?: number;
  resistenciaAislamiento?: number;
}

export interface FichaElectricaData {
  tipoTrabajo: 'instalacion_nueva' | 'remodelacion' | 'mantenimiento' | 'diagnostico';
  voltajeServicio: '120V' | '240V' | '480V' | 'otro';
  fases: 'monofasico' | 'bifasico' | 'trifasico';
  tableros: Tablero[];
  circuitos: Circuito[];
  materiales: Material[];
  mediciones?: Mediciones;
  observacionesGenerales?: string;
  recomendaciones?: string;
}
