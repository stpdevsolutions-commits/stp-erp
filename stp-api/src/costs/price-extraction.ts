import { PriceCurrency } from './entities/material-price.entity';

/**
 * Contrato de la extracción: qué se le pide al modelo y qué se acepta de vuelta.
 *
 * Está aparte del service a propósito — es la parte que se puede probar sin red y sin
 * gastar tokens, y es donde vive la desconfianza: **nada de lo que devuelve el modelo
 * se cree sin pasar por `sanitizeExtraction`**.
 */

/** Una línea tal como la pide el schema al modelo. */
export interface RawExtractedLine {
  description: string;
  code: string | null;
  unit: string | null;
  price: number;
  currency: string;
  itbisIncluded: boolean;
  discountPct: number;
}

export interface RawExtraction {
  documentDate: string | null;
  lines: RawExtractedLine[];
}

/** Línea ya validada, lista para guardarse como borrador. */
export interface CleanExtractedLine {
  position: number;
  rawDescription: string;
  rawCode: string | null;
  rawUnit: string | null;
  price: number;
  currency: PriceCurrency;
  itbisIncluded: boolean;
  discountPct: number;
}

export interface CleanExtraction {
  documentDate: string | null;
  lines: CleanExtractedLine[];
  /** Líneas que el modelo devolvió y se descartaron, con el motivo. Se guarda en `notes`. */
  discarded: string[];
}

/**
 * Tope de líneas por documento. Una cotización de proveedor de STP tiene decenas de
 * renglones; miles significa que el modelo se descarriló o que el PDF no era una
 * cotización, y en ambos casos es mejor cortar que llenar la base de basura.
 */
export const MAX_LINES = 400;

/**
 * Precio unitario máximo aceptable en DOP. No es un límite de negocio: es un cortafuegos
 * contra el error clásico de leer mal un separador de miles (1,250.00 → 1250000).
 */
export const MAX_UNIT_PRICE = 10_000_000;

/**
 * Schema de la respuesta (`response_format.schema`). Al forzarlo, la salida llega ya con
 * esta forma y no hay que rescatar JSON de un texto en prosa — por eso el saneado de
 * abajo se ocupa de los VALORES (precios imposibles, monedas raras), no de la estructura.
 *
 * Se ciñe al subconjunto de OpenAPI 3.0 que acepta la API: tipos, `enum`, `required` y
 * `items`. Sin `additionalProperties`, que no aporta nada aquí y es de lo primero que
 * rechazan estos validadores.
 */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    documentDate: {
      type: ['string', 'null'],
      description:
        'Fecha del documento en formato YYYY-MM-DD. null si el documento no la trae. ' +
        'No inventes una fecha ni uses la de hoy.',
    },
    lines: {
      type: 'array',
      description: 'Una entrada por renglón de material cotizado, en el orden del documento.',
      items: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description:
              'Descripción del material EXACTAMENTE como aparece en el documento, sin ' +
              'normalizar, traducir ni completar abreviaturas.',
          },
          code: {
            type: ['string', 'null'],
            description: 'Código o referencia del proveedor para ese renglón. null si no hay.',
          },
          unit: {
            type: ['string', 'null'],
            description: 'Unidad tal como aparece ("UD", "qq", "m2", "galón"). null si no hay.',
          },
          price: {
            type: 'number',
            description:
              'Precio UNITARIO. Si el documento solo da cantidad y total, divide el total ' +
              'entre la cantidad. Si no puedes obtener un unitario, omite el renglón.',
          },
          currency: {
            type: 'string',
            enum: ['DOP', 'USD'],
            description: 'Moneda del precio. DOP si el documento no dice otra cosa.',
          },
          itbisIncluded: {
            type: 'boolean',
            description:
              'true solo si el documento dice que ese precio ya incluye ITBIS. Ante la duda, false.',
          },
          discountPct: {
            type: 'number',
            description: 'Descuento en porcentaje aplicado a ese renglón. 0 si no hay.',
          },
        },
        required: ['description', 'code', 'unit', 'price', 'currency', 'itbisIncluded', 'discountPct'],
      },
    },
  },
  required: ['documentDate', 'lines'],
} as const;

export const EXTRACTION_SYSTEM_PROMPT = `Extraes precios de materiales de cotizaciones y facturas de proveedores de construcción y electromecánica de República Dominicana, para el ERP de una empresa que los usará para cotizar obra.

Reglas:
- Copia las descripciones tal como están en el documento. No las normalices, traduzcas ni completes: alguien las va a comparar contra el PDF renglón por renglón.
- El precio que interesa es el UNITARIO. Si el documento solo trae cantidad y total de línea, divide. Si un renglón no permite obtener un unitario fiable, omítelo.
- Omite lo que no sea un material con precio: subtotales, ITBIS, totales, transporte, mano de obra, notas, condiciones de pago y encabezados de sección.
- Los documentos dominicanos usan coma para miles y punto para decimales (1,250.50 = mil doscientos cincuenta con cincuenta). No confundas el separador de miles con un decimal.
- No inventes datos. Si un campo no está en el documento, usa null (o false/0 donde el campo no admite null). Es preferible un renglón menos que un dato inventado.
- Si el documento no es una cotización ni una factura de materiales, devuelve una lista vacía.`;

/** Instrucción del turno de usuario. Va después del PDF, como pide la API. */
export const EXTRACTION_USER_PROMPT =
  'Extrae los materiales cotizados de este documento con su precio unitario.';

function toCurrency(value: string): PriceCurrency | null {
  const upper = (value ?? '').trim().toUpperCase();
  if (upper === 'DOP' || upper === 'RD$' || upper === 'RD') return PriceCurrency.DOP;
  if (upper === 'USD' || upper === 'US$' || upper === '$') return PriceCurrency.USD;
  return null;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Filtra la salida del modelo dejando solo líneas utilizables, y devuelve las razones de
 * lo descartado para que quede rastro en la revisión.
 *
 * Descarta en vez de corregir: un precio fuera de rango o una moneda desconocida son
 * señales de que el modelo leyó mal ese renglón, y "arreglarlo" aquí sería inventar
 * exactamente lo que este módulo no puede permitirse.
 */
export function sanitizeExtraction(raw: RawExtraction): CleanExtraction {
  const lines: CleanExtractedLine[] = [];
  const discarded: string[] = [];

  const documentDate =
    raw.documentDate && isValidDate(raw.documentDate.slice(0, 10))
      ? raw.documentDate.slice(0, 10)
      : null;

  for (const line of raw.lines ?? []) {
    if (lines.length >= MAX_LINES) {
      discarded.push(`Se ignoraron las líneas a partir de la ${MAX_LINES + 1} (tope del importador)`);
      break;
    }

    const description = (line.description ?? '').trim();
    if (!description) {
      discarded.push('Línea sin descripción');
      continue;
    }

    const price = Number(line.price);
    if (!Number.isFinite(price) || price <= 0) {
      discarded.push(`"${description}": precio no utilizable (${String(line.price)})`);
      continue;
    }

    const currency = toCurrency(line.currency);
    if (!currency) {
      discarded.push(`"${description}": moneda desconocida (${String(line.currency)})`);
      continue;
    }

    // El tope solo aplica en DOP: 10.000 USD por unidad es raro pero posible (un equipo).
    if (currency === PriceCurrency.DOP && price > MAX_UNIT_PRICE) {
      discarded.push(`"${description}": precio fuera de rango (${price})`);
      continue;
    }

    const discountPct = Number(line.discountPct);

    lines.push({
      position: lines.length,
      rawDescription: description,
      rawCode: line.code?.trim() || null,
      rawUnit: line.unit?.trim() || null,
      price,
      currency,
      itbisIncluded: line.itbisIncluded === true,
      discountPct: Number.isFinite(discountPct) && discountPct > 0 && discountPct < 100 ? discountPct : 0,
    });
  }

  return { documentDate, lines, discarded };
}
