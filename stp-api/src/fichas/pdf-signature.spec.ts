import { generateFichaPdfHtml, sanitizeSignaturePaths } from './pdf.generator';

function ficha(over: Record<string, unknown> = {}): any {
  return {
    code: 'FT-001',
    type: 'civil',
    status: 'borrador',
    data: {},
    createdAt: new Date('2026-01-01'),
    project: { name: 'Proyecto' },
    technician: { firstName: 'Ana', lastName: 'Pérez' },
    ...over,
  };
}

describe('pdf.generator: firma', () => {
  it('una firma legítima aparece como <path>', () => {
    const html = generateFichaPdfHtml(ficha({ signature: 'M10.5,20 L30,40.25|M1,2 L3,4' }));
    expect(html).toContain('d="M10.5,20 L30,40.25"');
    expect(html).toContain('d="M1,2 L3,4"');
    expect(html).toContain('Firma del técnico');
  });

  it('una firma con "/><script> no llega al HTML', () => {
    const evil = 'M1,2 L3,4|M0 0"/><script>alert(1)</script><path d="';
    const html = generateFichaPdfHtml(ficha({ signature: evil }));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('d="M1,2 L3,4"');
  });

  it('si todos los trazos son inválidos no hay sección de firma', () => {
    const html = generateFichaPdfHtml(ficha({ signature: '"/><script>x</script>' }));
    expect(html).not.toContain('Firma del técnico');
    expect(html).not.toContain('<script');
  });

  it('limita número y longitud de trazos', () => {
    const many = Array.from({ length: 500 }, () => 'M1,1 L2,2').join('|');
    expect(sanitizeSignaturePaths(many)).toHaveLength(200);
    expect(sanitizeSignaturePaths('M' + '1'.repeat(30000))).toHaveLength(0);
    expect(sanitizeSignaturePaths(undefined)).toEqual([]);
  });
});

describe('pdf.generator: escape de datos', () => {
  it('el caso default escapa el JSON', () => {
    const html = generateFichaPdfHtml(ficha({ type: 'desconocido', data: { x: '<script>alert(1)</script>' } }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapa campos de ficha y datos de usuario', () => {
    const html = generateFichaPdfHtml(
      ficha({
        code: '<img src=x onerror=1>',
        data: { areas: [{ nombre: '<b>x</b>' }], observacionesGenerales: '<i>y</i>' },
      }),
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('<i>y</i>');
  });
});
