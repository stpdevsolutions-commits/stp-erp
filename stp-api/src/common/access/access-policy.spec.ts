import {
  AccessSubject,
  EMPTY_MEMBERSHIP,
  Membership,
  buildListScope,
  decideAccess,
  hasUnrestrictedAccess,
} from './access-policy';
import { UserRole } from '../../users/entities/user.entity';

const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const PROJECT_A = 'project-a'; // pertenece a CLIENT_A
const PROJECT_B = 'project-b'; // pertenece a CLIENT_B

const admin: AccessSubject = { id: 'u-admin', role: UserRole.ADMIN };
const manager: AccessSubject = { id: 'u-manager', role: UserRole.MANAGER };
const tech: AccessSubject = { id: 'u-tech', role: UserRole.USER };

/** Técnico asignado solo al PROJECT_A (de CLIENT_A). */
const projectMembership: Membership = {
  clientIds: new Set<string>(),
  projectIds: new Set([PROJECT_A]),
  projectClientIds: new Set([CLIENT_A]),
};

/** Técnico asignado al CLIENT_A entero. */
const clientMembership: Membership = {
  clientIds: new Set([CLIENT_A]),
  projectIds: new Set<string>(),
  projectClientIds: new Set<string>(),
};

describe('hasUnrestrictedAccess', () => {
  it('ADMIN y MANAGER pasan siempre', () => {
    expect(hasUnrestrictedAccess(UserRole.ADMIN)).toBe(true);
    expect(hasUnrestrictedAccess(UserRole.MANAGER)).toBe(true);
  });

  it('USER no', () => {
    expect(hasUnrestrictedAccess(UserRole.USER)).toBe(false);
    expect(hasUnrestrictedAccess(undefined)).toBe(false);
  });
});

describe('decideAccess — ADMIN y MANAGER', () => {
  const anyResource = {
    kind: 'file' as const,
    clientId: CLIENT_B,
    projectId: PROJECT_B,
  };

  it('ADMIN nunca queda bloqueado, ni sin asignaciones', () => {
    expect(decideAccess(admin, EMPTY_MEMBERSHIP, anyResource)).toBe(true);
  });

  it('MANAGER tampoco', () => {
    expect(decideAccess(manager, EMPTY_MEMBERSHIP, anyResource)).toBe(true);
  });

  it('ni siquiera si el recurso no se pudo resolver', () => {
    expect(decideAccess(admin, EMPTY_MEMBERSHIP, null)).toBe(true);
  });
});

describe('decideAccess — sin sujeto', () => {
  it('deniega', () => {
    expect(
      decideAccess(null, EMPTY_MEMBERSHIP, {
        kind: 'file',
        clientId: CLIENT_A,
      }),
    ).toBe(false);
    expect(
      decideAccess(undefined, EMPTY_MEMBERSHIP, {
        kind: 'file',
        clientId: CLIENT_A,
      }),
    ).toBe(false);
  });
});

describe('decideAccess — USER sin asignaciones', () => {
  it('no ve nada de clientes ni proyectos ajenos', () => {
    expect(
      decideAccess(tech, EMPTY_MEMBERSHIP, {
        kind: 'file',
        clientId: CLIENT_A,
        projectId: PROJECT_A,
      }),
    ).toBe(false);
    expect(
      decideAccess(tech, EMPTY_MEMBERSHIP, {
        kind: 'client',
        clientId: CLIENT_A,
      }),
    ).toBe(false);
    expect(
      decideAccess(tech, EMPTY_MEMBERSHIP, {
        kind: 'project',
        projectId: PROJECT_A,
      }),
    ).toBe(false);
  });

  it('pero sí lo que él mismo subió/creó', () => {
    expect(
      decideAccess(tech, EMPTY_MEMBERSHIP, {
        kind: 'file',
        clientId: CLIENT_B,
        projectId: PROJECT_B,
        ownerId: tech.id,
      }),
    ).toBe(true);
  });
});

describe('decideAccess — USER asignado a un proyecto', () => {
  it('accede a los archivos de ese proyecto', () => {
    expect(
      decideAccess(tech, projectMembership, {
        kind: 'file',
        clientId: CLIENT_A,
        projectId: PROJECT_A,
      }),
    ).toBe(true);
  });

  it('NO accede a otro proyecto del mismo cliente', () => {
    expect(
      decideAccess(tech, projectMembership, {
        kind: 'file',
        clientId: CLIENT_A,
        projectId: 'otro-proyecto',
      }),
    ).toBe(false);
  });

  it('NO accede a los documentos a nivel de cliente (contratos, pagos)', () => {
    expect(
      decideAccess(tech, projectMembership, {
        kind: 'file',
        clientId: CLIENT_A,
        projectId: null,
      }),
    ).toBe(false);
  });

  it('sí puede leer la ficha del cliente dueño del proyecto', () => {
    expect(
      decideAccess(tech, projectMembership, {
        kind: 'client',
        clientId: CLIENT_A,
      }),
    ).toBe(true);
  });

  it('pero no si se exige pertenencia estricta al cliente', () => {
    expect(
      decideAccess(tech, projectMembership, {
        kind: 'client',
        clientId: CLIENT_A,
        strictClient: true,
      }),
    ).toBe(false);
  });

  it('no accede a nada de otro cliente', () => {
    expect(
      decideAccess(tech, projectMembership, {
        kind: 'payment',
        clientId: CLIENT_B,
        projectId: PROJECT_B,
      }),
    ).toBe(false);
  });
});

describe('decideAccess — USER asignado a un cliente', () => {
  it('accede a todo lo de ese cliente, con y sin proyecto', () => {
    expect(
      decideAccess(tech, clientMembership, {
        kind: 'file',
        clientId: CLIENT_A,
        projectId: null,
      }),
    ).toBe(true);
    expect(
      decideAccess(tech, clientMembership, {
        kind: 'file',
        clientId: CLIENT_A,
        projectId: 'cualquier-proyecto-del-cliente',
      }),
    ).toBe(true);
    expect(
      decideAccess(tech, clientMembership, {
        kind: 'client',
        clientId: CLIENT_A,
        strictClient: true,
      }),
    ).toBe(true);
  });

  it('no accede a otro cliente', () => {
    expect(
      decideAccess(tech, clientMembership, {
        kind: 'client',
        clientId: CLIENT_B,
      }),
    ).toBe(false);
  });
});

describe('decideAccess — recursos sin ámbito', () => {
  it('un recurso sin cliente ni proyecto se deniega a USER', () => {
    expect(decideAccess(tech, projectMembership, { kind: 'expense' })).toBe(
      false,
    );
  });

  it('un recurso inexistente (null) se deniega a USER', () => {
    expect(decideAccess(tech, projectMembership, null)).toBe(false);
  });
});

describe('buildListScope', () => {
  it('devuelve null (sin restricción) para ADMIN y MANAGER', () => {
    expect(buildListScope(admin, EMPTY_MEMBERSHIP)).toBeNull();
    expect(buildListScope(manager, EMPTY_MEMBERSHIP)).toBeNull();
  });

  it('para USER incluye los clientes derivados de sus proyectos', () => {
    const scope = buildListScope(tech, projectMembership);
    expect(scope).not.toBeNull();
    expect(scope!.projectIds).toEqual([PROJECT_A]);
    expect(scope!.clientIds).toEqual([]);
    expect(scope!.visibleClientIds).toEqual([CLIENT_A]);
  });

  it('para USER sin asignaciones queda todo vacío', () => {
    const scope = buildListScope(tech, EMPTY_MEMBERSHIP);
    expect(scope).toEqual({
      clientIds: [],
      projectIds: [],
      visibleClientIds: [],
    });
  });
});
