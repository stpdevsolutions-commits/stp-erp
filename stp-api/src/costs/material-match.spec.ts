import { asignacionSegura, rankear, tokens } from './material-match';

// Nombres reales del catálogo (2026-09-25).
const catalogo = [
  { id: '1', name: 'Cable #12' },
  { id: '2', name: 'Cable #10' },
  { id: '3', name: 'Cable #1/0' },
  { id: '4', name: 'Cable #2/0' },
  { id: '5', name: 'Cable goma 8-4' },
  { id: '6', name: 'Breaker 1x15A G.E. o similar' },
  { id: '7', name: 'Breaker 1x20A G.E. o similar' },
];

describe('material-match', () => {
  it('normaliza: sin color, sin "ST", alambre = cable, #12 = 12', () => {
    expect(tokens('ALAMBRE ST THHN #12 NEGRO')).toEqual(['cable', 'thhn', '12']);
  });

  it('"ALAMBRE ST THHN #12 NEGRO" se asigna solo a "Cable #12"', () => {
    const r = rankear('ALAMBRE ST THHN #12 NEGRO', catalogo);
    expect(r[0].item.name).toBe('Cable #12');
    expect(asignacionSegura(r)?.name).toBe('Cable #12');
  });

  it('nunca propone otro calibre', () => {
    const r = rankear('ALAMBRE ST THHN #12 NEGRO', catalogo);
    expect(r.map((c) => c.item.name)).not.toContain('Cable #10');
    expect(rankear('ALAMBRE ST THHN #1/0 NEGRO', catalogo)[0].item.name).toBe('Cable #1/0');
  });

  it('no sugiere por un número suelto: "TUBO EMT 1-1/2 X 10" no es "Cable #10"', () => {
    expect(rankear('TUBO EMT DE 1-1/2 X 10', catalogo)).toHaveLength(0);
  });

  it('breakers con "G.E. o similar" en el catálogo', () => {
    const r = rankear('BREAKER 1X15A GE', catalogo);
    expect(r[0].item.name).toBe('Breaker 1x15A G.E. o similar');
  });

  it('sin nada parecido: sin candidatos y sin asignación', () => {
    const r = rankear('PLANCHA DENS-GLASS GOLD 4X8X1/2', catalogo);
    expect(r).toHaveLength(0);
    expect(asignacionSegura(r)).toBeNull();
  });

  it('con empate no asigna solo', () => {
    const dup = [{ name: 'Tubo PVC 1/2' }, { name: 'Tubo EMT 1/2' }];
    expect(asignacionSegura(rankear('TUBO 1/2 PVC EMT', dup))).toBeNull();
  });
});
