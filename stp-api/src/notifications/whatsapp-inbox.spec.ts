import { parseInboundMessages } from './whatsapp-inbox.service';

const wrap = (messages: unknown[]) => ({ entry: [{ changes: [{ value: { messages } }] }] });

describe('parseInboundMessages', () => {
  it('lee un texto', () => {
    const r = parseInboundMessages(wrap([{ id: 'a', from: '18095551234', type: 'text', text: { body: 'hola' } }]));
    expect(r).toEqual([expect.objectContaining({ id: 'a', from: '18095551234', type: 'text', text: 'hola' })]);
  });

  it('lee una foto y un PDF con su id de archivo', () => {
    const r = parseInboundMessages(
      wrap([
        { id: 'b', from: '18095551234', type: 'image', image: { id: 'm1', mime_type: 'image/jpeg' } },
        { id: 'c', from: '18095551234', type: 'document', document: { id: 'm2', mime_type: 'application/pdf', filename: 'f.pdf' } },
      ]),
    );
    expect(r.map((m) => [m.mediaId, m.mime])).toEqual([
      ['m1', 'image/jpeg'],
      ['m2', 'application/pdf'],
    ]);
  });

  it('lee la opción elegida en una lista o un botón', () => {
    const r = parseInboundMessages(
      wrap([
        { id: 'd', from: '1809', type: 'interactive', interactive: { list_reply: { id: 'p:abc' } } },
        { id: 'e', from: '1809', type: 'interactive', interactive: { button_reply: { id: 'save' } } },
      ]),
    );
    expect(r.map((m) => m.interactiveId)).toEqual(['p:abc', 'save']);
  });

  it('ignora los estados de entrega y lo que no es un mensaje', () => {
    expect(parseInboundMessages({ entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] })).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
    expect(parseInboundMessages(wrap([{ from: '1809', type: 'text' }]))).toEqual([]);
  });
});
