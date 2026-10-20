import { buildUserPrompt, CopilotEngine, CopilotUnavailableError, type EngineInput } from './copilot-engine';

const input: EngineInput = {
  history: [{ from: 'cliente', text: 'Hola, quiero cámaras para mi negocio' }],
  clientName: 'Carlos Pérez',
  clientExists: false,
  firstContact: true,
  workingHours: true,
};

const make = (env: Record<string, string | undefined>) => {
  const engine = new CopilotEngine({ get: (k: string) => env[k] } as never);
  engine.sleep = async () => undefined;
  return engine;
};

const priv = (e: CopilotEngine) => e as unknown as { callGemini: jest.Mock; callClaude: jest.Mock };
const JSON_OK = JSON.stringify({ category: 'nueva_consulta', summary: 'x', escalate: false, confidence: 0.9 });

describe('CopilotEngine', () => {
  it('usa Gemini primero', async () => {
    const e = make({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' });
    priv(e).callGemini = jest.fn().mockResolvedValue({ text: JSON_OK, model: 'gemini-flash-latest' });
    priv(e).callClaude = jest.fn();
    const r = await e.analyze(input);
    expect(r.provider).toBe('gemini');
    expect(r.raw.category).toBe('nueva_consulta');
    expect(priv(e).callClaude).not.toHaveBeenCalled();
  });

  it('reintenta una vez ante 503 y luego pasa a Claude', async () => {
    const e = make({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' });
    priv(e).callGemini = jest.fn().mockRejectedValue(Object.assign(new Error('503 UNAVAILABLE high demand'), { status: 503 }));
    priv(e).callClaude = jest.fn().mockResolvedValue({ text: '```json\n' + JSON_OK + '\n```', model: 'haiku' });
    const r = await e.analyze(input);
    expect(priv(e).callGemini).toHaveBeenCalledTimes(2);
    expect(r.provider).toBe('claude');
  });

  it('un error permanente (clave o saldo) no se reintenta y pasa al siguiente', async () => {
    const e = make({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', COPILOT_PROVIDERS: 'claude,gemini' });
    priv(e).callClaude = jest.fn().mockRejectedValue(Object.assign(new Error('HTTP 400: credit balance is too low'), { status: 400 }));
    priv(e).callGemini = jest.fn().mockResolvedValue({ text: JSON_OK, model: 'm' });
    const r = await e.analyze(input);
    expect(priv(e).callClaude).toHaveBeenCalledTimes(1);
    expect(r.provider).toBe('gemini');
    // y en la siguiente consulta Claude se salta unos minutos
    await e.analyze(input);
    expect(priv(e).callClaude).toHaveBeenCalledTimes(1);
  });

  it('respuesta ilegible se trata como pasajera y se reintenta', async () => {
    const e = make({ GEMINI_API_KEY: 'g' });
    priv(e).callGemini = jest.fn().mockResolvedValueOnce({ text: 'no es json', model: 'm' }).mockResolvedValueOnce({ text: JSON_OK, model: 'm' });
    const r = await e.analyze(input);
    expect(r.raw.summary).toBe('x');
    expect(priv(e).callGemini).toHaveBeenCalledTimes(2);
  });

  it('si todos fallan lanza CopilotUnavailableError con el indicador de reintento', async () => {
    const e = make({ GEMINI_API_KEY: 'g' });
    priv(e).callGemini = jest.fn().mockRejectedValue(new Error('503 overloaded'));
    await expect(e.analyze(input)).rejects.toMatchObject({ transient: true });
    const perm = make({ GEMINI_API_KEY: 'g' });
    priv(perm).callGemini = jest.fn().mockRejectedValue(Object.assign(new Error('API key not valid'), { status: 403 }));
    await expect(perm.analyze(input)).rejects.toBeInstanceOf(CopilotUnavailableError);
    await expect(perm.analyze(input)).rejects.toMatchObject({ transient: false });
  });

  it('sin claves no hay proveedores', async () => {
    const e = make({});
    expect(e.providers()).toEqual([]);
    await expect(e.analyze(input)).rejects.toMatchObject({ transient: false });
  });

  it('COPILOT_PROVIDERS ordena y filtra por claves disponibles', () => {
    expect(make({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', COPILOT_PROVIDERS: 'claude,gemini' }).providers()).toEqual(['claude', 'gemini']);
    expect(make({ GEMINI_API_KEY: 'g', COPILOT_PROVIDERS: 'claude,gemini' }).providers()).toEqual(['gemini']);
    expect(make({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', COPILOT_PROVIDERS: 'basura' }).providers()).toEqual([]);
  });
});

describe('CopilotEngine: Gemini', () => {
  it('cuota diaria agotada en el modelo principal: usa el de respaldo y no vuelve a intentar el principal durante una hora', async () => {
    const e = make({ GEMINI_API_KEY: 'g' });
    const create = jest.fn(async (req: { model: string }) => {
      if (req.model === 'gemini-flash-latest') throw Object.assign(new Error('429 Rate limit exceeded (limit: 20 requests per day on Free Tier)'), { status: 429 });
      return { output_text: JSON_OK };
    });
    (e as unknown as { gemini: unknown }).gemini = { interactions: { create } };
    const r1 = await e.analyze(input);
    expect(r1.model).toBe('gemini-flash-lite-latest');
    expect(create.mock.calls.map((c) => c[0].model)).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
    create.mockClear();
    await e.analyze(input);
    expect(create.mock.calls.map((c) => c[0].model)).toEqual(['gemini-flash-lite-latest']);
  });
});

describe('buildUserPrompt (R11 privacidad)', () => {
  it('manda solo el nombre de pila y nunca un teléfono', () => {
    const p = buildUserPrompt({ ...input, history: [{ from: 'cliente', text: 'Mi cel es 8091234567' }] });
    expect(p).toContain('Nombre de pila del cliente: Carlos');
    expect(p).not.toContain('Pérez');
    expect(p).toContain('CLIENTE: Mi cel es 8091234567'); // lo que el propio cliente escribe va tal cual
    expect(p).toContain('<<<');
  });
});
