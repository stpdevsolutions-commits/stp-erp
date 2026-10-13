import { parseWebhook, previewOf } from './whatsapp-parse';
import { isWorkingHours } from './messaging.service';
import { WA_TEMPLATES } from './wa-templates';

const wrap = (value: unknown) => ({ entry: [{ changes: [{ value }] }] });

describe('parseWebhook', () => {
  it('lee un texto con el nombre del perfil', () => {
    const { messages } = parseWebhook(
      wrap({
        contacts: [{ wa_id: '18094208567', profile: { name: 'Carlos' } }],
        messages: [{ id: 'wamid.1', from: '18094208567', timestamp: '1760000000', type: 'text', text: { body: 'Hola' } }],
      }),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ waId: 'wamid.1', from: '18094208567', profileName: 'Carlos', type: 'text', body: 'Hola' });
    expect(messages[0].sentAt.getTime()).toBe(1760000000 * 1000);
  });

  it('convierte una ubicación en un enlace de mapa', () => {
    const { messages } = parseWebhook(
      wrap({ messages: [{ id: 'w2', from: '1809', type: 'location', location: { latitude: 18.45, longitude: -69.95 } }] }),
    );
    expect(messages[0].body).toContain('https://www.google.com/maps?q=18.45,-69.95');
  });

  it('guarda el adjunto de un documento', () => {
    const { messages } = parseWebhook(
      wrap({ messages: [{ id: 'w3', from: '1809', type: 'document', document: { id: 'm1', mime_type: 'application/pdf', filename: 'plano.pdf' } }] }),
    );
    expect(messages[0]).toMatchObject({ mediaId: 'm1', mime: 'application/pdf', filename: 'plano.pdf' });
  });

  it('toma el texto de un botón de respuesta rápida de una plantilla', () => {
    const { messages } = parseWebhook(wrap({ messages: [{ id: 'w4', from: '1809', type: 'button', button: { text: 'Confirmo' } }] }));
    expect(messages[0].body).toBe('Confirmo');
  });

  it('ignora las reacciones', () => {
    const { messages } = parseWebhook(wrap({ messages: [{ id: 'w5', from: '1809', type: 'reaction' }] }));
    expect(messages).toHaveLength(0);
  });

  it('lee los avisos de estado y su error', () => {
    const { statuses } = parseWebhook(
      wrap({
        statuses: [
          { id: 'a', status: 'delivered', timestamp: '1760000100' },
          { id: 'b', status: 'failed', timestamp: '1760000200', errors: [{ code: 131047, message: 'Re-engagement message' }] },
        ],
      }),
    );
    expect(statuses.map((s) => s.status)).toEqual(['delivered', 'failed']);
    expect(statuses[1].error).toContain('131047');
  });

  it('un cuerpo inesperado no rompe nada', () => {
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook({ entry: 'x' })).toEqual({ messages: [], statuses: [] });
  });
});

describe('previewOf', () => {
  it('recorta el texto largo y nombra los adjuntos sin texto', () => {
    expect(previewOf('text', 'a'.repeat(200))).toHaveLength(120);
    expect(previewOf('image')).toBe('Foto');
    expect(previewOf('audio')).toBe('Nota de voz');
  });
});

describe('isWorkingHours (hora de RD, UTC-4)', () => {
  // 2026-10-14 es miércoles.
  it('lunes a viernes de 8:00 a 18:00', () => {
    expect(isWorkingHours(new Date('2026-10-14T12:00:00Z'))).toBe(true); // 8:00 RD
    expect(isWorkingHours(new Date('2026-10-14T11:59:00Z'))).toBe(false); // 7:59 RD
    expect(isWorkingHours(new Date('2026-10-14T21:59:00Z'))).toBe(true); // 17:59 RD
    expect(isWorkingHours(new Date('2026-10-14T22:00:00Z'))).toBe(false); // 18:00 RD
  });

  it('sábado hasta las 13:00 y domingo cerrado', () => {
    expect(isWorkingHours(new Date('2026-10-17T16:59:00Z'))).toBe(true); // sáb 12:59 RD
    expect(isWorkingHours(new Date('2026-10-17T17:00:00Z'))).toBe(false); // sáb 13:00 RD
    expect(isWorkingHours(new Date('2026-10-18T15:00:00Z'))).toBe(false); // domingo
  });
});

describe('plantillas', () => {
  it('cada texto usa tantos datos como parámetros declara', () => {
    for (const t of WA_TEMPLATES) {
      const text = t.render(t.params.map((_, i) => `P${i + 1}`));
      for (let i = 1; i <= t.params.length; i++) expect(text).toContain(`P${i}`);
    }
  });
});
