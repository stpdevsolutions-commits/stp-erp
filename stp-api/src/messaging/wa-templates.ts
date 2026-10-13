/**
 * Plantillas de WhatsApp aprobadas por Meta que la bandeja puede enviar fuera de la ventana de 24 h
 * (todas de categoría Utilidad, idioma español). El texto debe ser IDÉNTICO al registrado en Meta:
 * aquí solo sirve para mostrarlo en la conversación, el envío lo hace Meta con los parámetros.
 */
export interface WaTemplate {
  name: string;
  label: string;
  /** Etiqueta de cada parámetro {{1}}, {{2}}... en orden. */
  params: string[];
  render: (p: string[]) => string;
}

const EMPRESA = 'Soluciones Técnicas Profesionales STP';

export const WA_TEMPLATES: WaTemplate[] = [
  {
    name: 'seguimiento_solicitud',
    label: 'Seguimiento de solicitud',
    params: ['Nombre del cliente', 'Servicio solicitado'],
    render: (p) =>
      `Hola ${p[0]}, le escribimos de ${EMPRESA} para dar seguimiento a su solicitud de ${p[1]}. ` +
      'Para continuar con la evaluación, ¿desea que coordinemos la visita técnica, que no tiene costo? ' +
      'Puede responder este mensaje y le atendemos.',
  },
  {
    name: 'visita_tecnica_confirmada',
    label: 'Visita técnica confirmada',
    params: ['Nombre del cliente', 'Fecha (ej. martes 14 de octubre)', 'Hora (ej. 10:00 a. m.)', 'Dirección'],
    render: (p) =>
      `Hola ${p[0]}, le confirmamos su visita técnica de STP para el ${p[1]} a las ${p[2]} en ${p[3]}. ` +
      'Si necesita cambiar la fecha o la hora, responda este mensaje y lo coordinamos. Quedamos atentos.',
  },
  {
    name: 'cotizacion_disponible',
    label: 'Cotización disponible',
    params: ['Nombre del cliente', 'Servicio cotizado'],
    render: (p) =>
      `Hola ${p[0]}, su cotización de ${p[1]} ya está lista. ` +
      'Si desea que se la enviemos por este medio, responda este mensaje y se la compartimos. ' +
      'También podemos resolver cualquier duda sobre su contenido.',
  },
];
