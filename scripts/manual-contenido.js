/**
 * Contenido del Manual del Usuario del ERP.
 *
 * Está separado del generador para que actualizar el manual sea editar texto y
 * no tocar código de maquetación. Cada bloque es { tipo: valor }; los tipos
 * disponibles están en `manual-usuario.js`.
 *
 * Todo lo que se afirma aquí sale del sistema real: los estados y categorías son
 * los enums de las entidades, los horarios los del SchedulerService y los
 * permisos los del RolesGuard. Si el ERP cambia, esto se actualiza y se
 * regenera el PDF.
 */

const VERSION = '1.0 — agosto 2026';

const CONTENIDO = [
  // ══════════════════════════════════════════════════════════════════════════
  { h1: '1. Antes de empezar' },

  { p: 'El ERP de STP reúne en un solo sitio lo que antes vivía repartido entre hojas de cálculo, carpetas y conversaciones: los clientes, las cotizaciones, las obras, lo que cuesta cada cosa, lo que se cobra y lo que se paga al personal. Este manual recorre el sistema módulo por módulo, en el mismo orden en que aparecen en el menú.' },

  { h2: 'Cómo se entra' },
  { p: 'El ERP no está abierto en internet. Solo se llega desde la red privada de la empresa (la VPN), y por eso no hace falta preocuparse de que alguien de fuera encuentre la dirección: sencillamente no responde si no estás conectado.' },
  { pasos: [
    'Conéctate a la VPN de STP desde tu computadora o tu teléfono.',
    'Abre el navegador y entra a erp.stpsoluciones.com.',
    'Inicia sesión con tu correo y contraseña, o con el botón de Google si tu cuenta es del dominio de la empresa.',
  ] },
  { ojo: 'Si la página no carga, lo primero que hay que revisar es la VPN, no el sistema. Es la causa habitual.' },

  { h2: 'Si olvidaste la contraseña' },
  { p: 'En la pantalla de inicio de sesión hay un enlace para recuperarla. El sistema envía un correo con un enlace temporal para poner una nueva. Si el correo no llega en unos minutos, revisa la carpeta de no deseados antes de pedir ayuda.' },

  { h2: 'Roles: qué puede hacer cada quien' },
  { p: 'Hay tres roles y funcionan en escalera: lo que puede un USUARIO también lo puede un GERENTE, y lo que puede un GERENTE también lo puede un ADMINISTRADOR. Tu rol lo asigna un administrador desde el módulo de Usuarios.' },
  { tabla: {
    cabeceras: ['Acción', 'Usuario', 'Gerente', 'Administrador'],
    anchos: [46, 18, 18, 18],
    filas: [
      ['Consultar la información', 'Sí', 'Sí', 'Sí'],
      ['Crear y editar tareas, gastos y fichas', 'Sí', 'Sí', 'Sí'],
      ['Crear y editar clientes, proyectos, cotizaciones, pagos, proveedores, colaboradores e inventario', 'No', 'Sí', 'Sí'],
      ['Subir archivos', 'No', 'Sí', 'Sí'],
      ['Ver reportes', 'No', 'Sí', 'Sí'],
      ['Ver y registrar nómina', 'No', 'Sí', 'Sí'],
      ['Eliminar registros', 'Solo sus tareas y fichas', 'Sus tareas y fichas', 'Todo'],
      ['Gestionar usuarios y la configuración de la empresa', 'No', 'No', 'Sí'],
    ],
  } },
  { nota: 'La nómina es el módulo más cerrado: expone sueldos, así que hace falta ser Gerente o Administrador incluso para mirarla.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '2. Cómo moverse por el sistema' },

  { h2: 'El menú lateral' },
  { p: 'El menú agrupa los módulos siguiendo el flujo de trabajo real: se le cotiza a un cliente, la obra se ejecuta, cuesta dinero, entra dinero, y detrás hay gente y configuración. Si tu rol no tiene acceso a ninguna entrada de un grupo, ese grupo no aparece.' },
  { tabla: {
    cabeceras: ['Grupo', 'Qué encuentras dentro'],
    anchos: [26, 74],
    filas: [
      ['Resumen', 'La portada: indicadores del mes, gráficas y acciones pendientes.'],
      ['Comercial', 'Clientes y Cotizaciones.'],
      ['Operación', 'Proyectos, Tareas, Fichas de campo y Archivos.'],
      ['Costos y compras', 'Costos (materiales, partidas ACU e importación de precios), Proveedores e Inventario.'],
      ['Finanzas', 'Pagos, Gastos y Reportes.'],
      ['Equipo', 'Colaboradores y Nómina.'],
      ['Administración', 'Usuarios y Configuración.'],
      ['Cuenta', 'Tu perfil y el cierre de sesión.'],
    ],
  } },
  { p: 'La entrada de Costos se despliega en sus cuatro vistas cuando entras en ella, y se repliega cuando trabajas en otra cosa.' },

  { h2: 'Lo que se repite en todas las pantallas' },
  { p: 'Los módulos se parecen entre sí a propósito: si aprendes uno, sabes moverte en los demás.' },
  { lista: [
    'Arriba a la derecha está el botón para crear un registro nuevo.',
    'Debajo del título hay filtros y un buscador. El buscador va por nombre, código o número.',
    'Las listas se paginan; abajo se indica cuántos resultados hay.',
    'Los estados se muestran como etiquetas de color, siempre con el mismo significado.',
    'El menú de tres puntos al final de cada fila abre las acciones de ese registro.',
  ] },

  { h2: 'El Resumen' },
  { p: 'Es lo primero que ves al entrar. Arriba, cuatro tarjetas con clientes, proyectos en curso, tareas vencidas y balance del mes. Debajo, las gráficas del período y una tira de acciones pendientes con lo que reclama atención. Las tarjetas y las filas de las tablas llevan al módulo correspondiente: se puede pinchar en ellas.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '3. Comercial' },

  { h2: '3.1 Clientes' },
  { p: 'Todo cuelga del cliente: los proyectos, las cotizaciones, los pagos y los archivos. Antes de cotizar hay que tenerlo registrado.' },
  { ruta: 'Comercial › Clientes › Nuevo cliente' },
  { p: 'Solo el nombre es obligatorio. Conviene completar el RNC (o la cédula si es persona física) porque es lo que aparece en las cotizaciones y los recibos. Un cliente puede ser empresa o persona física.' },
  { nota: 'Si estás cotizando y el cliente todavía no existe, no hace falta salir del formulario: dentro de la nueva cotización hay un botón para crearlo al vuelo, y queda seleccionado sin perder lo que llevabas escrito.' },
  { p: 'En la ficha de un cliente se ve su balance: lo cotizado y aprobado, lo cobrado, los gastos imputados y lo que queda pendiente de cobro.' },
  { ojo: 'Al borrar un cliente se van con él sus proyectos y cotizaciones. Es una operación de administrador y no tiene vuelta atrás.' },

  { h2: '3.2 Cotizaciones' },
  { p: 'El módulo donde se define lo que se le ofrece al cliente y por cuánto. Cada cotización recibe un número correlativo del tipo COT-2026-001, que se genera solo.' },

  { h3: 'Crear una cotización' },
  { ruta: 'Comercial › Cotizaciones › Nueva cotización' },
  { pasos: [
    'Elige el cliente (o créalo ahí mismo) y, si aplica, el proyecto.',
    'Escribe el título: es lo que el cliente lee primero.',
    'Arma las partidas.',
    'Revisa los costos indirectos y el ITBIS.',
    'Guarda como borrador y, cuando esté lista, envíala.',
  ] },

  { h3: 'Partidas y subpartidas' },
  { p: 'Las partidas se organizan como un árbol: una partida puede dividirse en subpartidas, y estas en otras, sin una profundidad fija. Así se puede cotizar "Baño" y dentro "Piso", "Plomería" y "Eléctrico", cada una con sus líneas.' },
  { nota: 'El subtotal suma únicamente las líneas finales, nunca los grupos. De lo contrario, cada partida se contaría dos veces. El cálculo lo hace siempre el servidor: la cifra que ves es la que se guarda.' },

  { h3: 'Unitarios a partir de una partida de costos (ACU)' },
  { p: 'Si tienes armada una partida de costos —una receta con sus materiales y su mano de obra—, el precio unitario de una línea puede salir de ahí en vez de escribirse a mano. Al hacerlo, el precio se congela en la cotización: si mañana sube el material, la cotización enviada no cambia sola.' },
  { p: 'Cuando el costo de la partida se mueve y la cotización sigue abierta, el sistema avisa del desfase para que decidas si actualizas el precio o lo dejas como está.' },

  { h3: 'Costos indirectos e ITBIS' },
  { p: 'Debajo de las partidas está el bloque de costos indirectos (administración, imprevistos, utilidad, transporte y demás). Se puede usar ese esquema o desactivarlo y aplicar solo el ITBIS del 18 % sobre el subtotal.' },

  { h3: 'Estados de una cotización' },
  { tabla: {
    cabeceras: ['Estado', 'Qué significa'],
    anchos: [22, 78],
    filas: [
      ['Borrador', 'Se está armando. Se puede editar libremente.'],
      ['Enviada', 'Ya salió al cliente y está esperando respuesta.'],
      ['Aprobada', 'El cliente la aceptó. Queda bloqueada para edición.'],
      ['Rechazada', 'El cliente la rechazó.'],
      ['Expirada', 'Se pasó de la fecha de validez sin respuesta.'],
    ],
  } },

  { h3: 'Enviarla y que el cliente responda' },
  { p: 'Al enviarla, el cliente recibe un correo con el PDF y dos botones: aprobar o rechazar. No necesita cuenta ni entrar al sistema; responde desde el propio correo. El ERP guarda la fecha de la decisión junto con datos técnicos del acceso, de modo que quede constancia de quién y cuándo respondió.' },
  { p: 'Si pasan tres días sin respuesta, el sistema envía un recordatorio, y como máximo dos por envío. Nunca insiste después de la fecha de validez.' },

  { h3: 'Revisiones' },
  { p: 'Cuando hay que cambiar algo de una cotización ya enviada, no se edita encima: se crea una revisión. La anterior queda marcada como reemplazada —se conserva como documento histórico, sin poder editarse ni aprobarse— y la nueva sigue con el mismo número y su número de revisión.' },

  { h3: 'Convertir en proyecto' },
  { p: 'Una vez aprobada, en el detalle de la cotización aparece el botón para convertirla en proyecto. El proyecto nace con el cliente, el título y el presupuesto ya puestos.' },
  { ojo: 'El botón solo aparece si la cotización está aprobada y todavía no tiene un proyecto asociado. Si no lo ves, revisa el estado: no se convierte una cotización que el cliente no ha aceptado.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '4. Operación' },

  { h2: '4.1 Proyectos' },
  { p: 'El proyecto es la obra. Recibe un código automático del tipo PRJ-2026-001 y a él se le imputan las tareas, los gastos, los pagos, las fichas y los archivos.' },
  { tabla: {
    cabeceras: ['Campo', 'Para qué sirve'],
    anchos: [24, 76],
    filas: [
      ['Tipo', 'Eléctrico, mecánico, construcción, mantenimiento u otro.'],
      ['Estado', 'Pendiente, en curso, en pausa, completado o cancelado.'],
      ['Presupuesto', 'Referencia contra la que se compara el gasto acumulado.'],
      ['Fechas', 'Inicio y cierre previsto.'],
    ],
  } },
  { p: 'En la ficha del proyecto se ve el consumo del presupuesto, el desglose de gastos por categoría, los cobros y el balance.' },

  { h2: '4.2 Tareas' },
  { p: 'Las tareas siempre pertenecen a un proyecto. Se pueden asignar a un usuario del sistema o a un colaborador de campo que no tiene cuenta.' },
  { ruta: 'Operación › Tareas › Nueva tarea' },
  { p: 'Al crearla, primero eliges el cliente —opcional, solo para acortar la lista— y después el proyecto. Ambos campos tienen buscador: se escribe parte del nombre o del código y la lista se filtra.' },
  { tabla: {
    cabeceras: ['Estados', 'Prioridades'],
    anchos: [50, 50],
    filas: [
      ['Pendiente · En curso · En revisión · Completada · Cancelada', 'Baja · Media · Alta · Urgente'],
    ],
  } },
  { nota: 'Al pasar una tarea a completada, el sistema guarda la fecha de cierre automáticamente. Las tareas vencidas aparecen en el Resumen y generan un aviso por correo.' },

  { h2: '4.3 Fichas de campo' },
  { p: 'Las fichas técnicas son el trabajo de los técnicos en obra: levantamientos, evaluaciones e inspecciones. Se llenan sobre todo desde la aplicación móvil, con fotos, ubicación y firma, aunque también se pueden consultar desde el ERP.' },
  { tabla: {
    cabeceras: ['Tipos de ficha', 'Estados'],
    anchos: [62, 38],
    filas: [
      ['Eléctrico · Civil · Electromecánico · Levantamiento · Evaluación de daños', 'Borrador · En progreso · Enviada'],
    ],
  } },
  { p: 'Cada ficha recibe un número correlativo (FT-2026-001) y, una vez enviada, genera un PDF para entregar al cliente.' },

  { h2: '4.4 Archivos' },
  { p: 'Aquí se guardan planos, fotos, documentos y comprobantes, organizados por cliente y por proyecto. Se admiten PDF, JPG, PNG y WEBP, con un máximo de 10 MB por archivo.' },
  { nota: 'Todo lo que se sube al ERP aparece también en Nextcloud, dentro de "Proyectos ERP", con el nombre original y ordenado por cliente. Es la misma copia, no un duplicado: no ocupa el doble.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '5. Costos y compras' },

  { p: 'Este es el módulo que permite cotizar con números propios en lugar de a ojo. La idea es sencilla: se registra lo que cuestan los materiales, se arman recetas de partidas con esos materiales, y esas recetas alimentan las cotizaciones.' },

  { h2: '5.1 Materiales y precios' },
  { p: 'El catálogo de materiales es la base. Cada material tiene código, nombre, unidad y categoría. Sobre cada material se van registrando precios, y ahí está lo importante: el historial de precios no se edita nunca.' },
  { ojo: 'Los precios son de solo añadir. Un precio equivocado no se corrige encima: se ANULA (queda en el historial, con el motivo) y se registra el correcto. El historial es lo que le da valor al módulo; sobrescribirlo destruiría justo lo que sirve para negociar.' },
  { p: 'El precio vigente de un material no es un campo guardado: es la fila más reciente que no esté anulada. Por eso las consultas siempre muestran el dato actual sin que nadie tenga que mantenerlo.' },
  { tabla: {
    cabeceras: ['De dónde sale un precio', 'Qué significa'],
    anchos: [32, 68],
    filas: [
      ['Manual', 'Alguien lo registró a mano.'],
      ['Cotización de proveedor', 'Salió de un documento del proveedor.'],
      ['Gasto', 'Se dedujo de una compra real de STP con cantidad y unitario.'],
      ['Importación', 'Entró en una carga masiva.'],
      ['Referencia externa', 'Precio de mercado. No es lo que STP pagó.'],
    ],
  } },
  { p: 'Cada precio guarda además su moneda, si incluye ITBIS, el descuento y la región. Para poder comparar, el sistema calcula un precio neto en pesos, sin impuesto y con el descuento aplicado: es el que se usa en promedios y gráficas.' },

  { h2: '5.2 Partidas de costos (ACU)' },
  { p: 'Una partida ACU es la receta de una unidad de obra: qué lleva una salida eléctrica, o un metro cuadrado de pañete. Se compone de materiales, mano de obra y equipos.' },
  { p: 'El costo unitario no se guarda: se calcula cada vez con los precios vigentes. Guardarlo lo congelaría y envejecería en silencio, que es justamente el problema que este módulo existe para resolver.' },
  { nota: 'Si a una partida le falta el precio de algún insumo, el sistema lo marca como incompleta en vez de dar un total engañoso.' },

  { h2: '5.3 Importar precios desde un PDF' },
  { p: 'Cuando llega la cotización de un proveedor en PDF, no hace falta teclear los precios uno por uno. El sistema los extrae con inteligencia artificial y los deja preparados para revisión.' },
  { ruta: 'Costos y compras › Costos › Importar precios › Subir cotización' },
  { pasos: [
    'Sube el PDF e indica el proveedor.',
    'Espera: la lectura ocurre en segundo plano y la página se actualiza sola. Puede tardar unos minutos.',
    'Revisa renglón por renglón contra el PDF: el sistema propone un material del catálogo solo cuando no hay dudas.',
    'Corrige lo que haga falta, descarta lo que no sirva y marca lo que sí.',
    'Pulsa Aprobar. Solo entonces esos precios entran al historial.',
  ] },
  { ojo: 'Nada de lo que lee la IA entra solo al historial de precios. Sin la aprobación de una persona, se queda en borrador. Es deliberado: un precio inventado por un modelo haría inservible todo el módulo.' },
  { p: 'Los renglones que el sistema descarta por su cuenta —precios imposibles, monedas desconocidas— quedan anotados en el lote, para que se vea qué se dejó fuera y por qué.' },

  { h2: '5.4 Unidades y categorías' },
  { p: 'Los datos maestros del módulo. Vienen cargadas las unidades habituales con sus conversiones, así que rara vez hay que tocarlo.' },

  { h2: '5.5 Proveedores' },
  { p: 'El registro de a quién se le compra, clasificado por materiales, equipos, servicios, subcontrato u otros. Los proveedores se enlazan a los gastos y a los precios, y eso permite después comparar a quién conviene comprarle cada cosa.' },

  { h2: '5.6 Inventario' },
  { p: 'Control de materiales, equipos y herramientas: existencias, ubicación, costo, precio y stock mínimo.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '6. Finanzas' },

  { h2: '6.1 Pagos' },
  { p: 'Los cobros que entran. Cada pago se asocia a un cliente y, si corresponde, a un proyecto o a una cotización.' },
  { tabla: {
    cabeceras: ['Métodos', 'Estados'],
    anchos: [55, 45],
    filas: [
      ['Efectivo · Transferencia · Cheque · Tarjeta · Otro', 'Pendiente · Completado · Fallido · Reembolsado'],
    ],
  } },
  { nota: 'Solo los pagos completados cuentan como ingreso en los reportes y en el balance. Un pago pendiente es una promesa, no un cobro.' },
  { p: 'Cada pago genera su recibo en PDF, que queda disponible para descargar y enviar.' },

  { h2: '6.2 Gastos' },
  { p: 'Lo que sale. Cada gasto pertenece a un proyecto y se clasifica en materiales, mano de obra, equipos, subcontrato, transporte u otro.' },
  { p: 'Si al registrar un gasto de material indicas la cantidad y el precio unitario, el sistema aprovecha el dato y registra ese precio en el historial del material. Así, comprar alimenta el catálogo de costos sin trabajo extra.' },
  { nota: 'Al eliminar un gasto, el precio que había generado no se borra: se anula, dejando constancia. Y su comprobante en PDF se limpia del almacenamiento.' },

  { h2: '6.3 Reportes' },
  { p: 'Cinco vistas, cada una con sus filtros:' },
  { lista: [
    'Proyecto: presupuesto, gastos por categoría, cobros, balance y estado de las tareas.',
    'Cliente: cotizado, aprobado, cobrado y pendiente de cobro.',
    'Ingresos: cobros del período por método de pago, con el detalle.',
    'Gastos: por categoría, por proyecto y por proveedor.',
    'Fichas: producción de campo por tipo, estado y técnico.',
  ] },
  { p: 'Cualquiera de los cinco se exporta con los botones de arriba a la derecha. El PDF se abre para imprimir; el Excel se descarga con los montos como números, listos para sumar y filtrar.' },
  { nota: 'La exportación respeta los filtros que tengas puestos: el archivo dice exactamente lo mismo que la pantalla.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '7. Equipo' },

  { h2: '7.1 Colaboradores' },
  { p: 'El personal de campo: nombre, cédula, posición y tarifa diaria. No son usuarios del sistema —no tienen cuenta ni entran al ERP—, pero se les asignan tareas y se les paga por nómina.' },
  { nota: 'La cédula y la tarifa diaria conviene tenerlas al día: la primera se imprime en el recibo de pago y la segunda se propone sola al registrar la nómina.' },

  { h2: '7.2 Nómina' },
  { p: 'Los pagos al personal por período trabajado. Cada pago recibe un número correlativo del tipo NOM-2026-001.' },
  { ruta: 'Equipo › Nómina › Nuevo pago' },

  { h3: 'Los días se calculan solos' },
  { p: 'Al indicar el período, el sistema cuenta los días trabajados según la jornada de STP y llena la casilla. Si hubo ausencias, el número se puede corregir a mano.' },
  { tabla: {
    cabeceras: ['Día', 'Cuenta como', 'Horas'],
    anchos: [34, 33, 33],
    filas: [
      ['Lunes a viernes', '1 día', '8 horas'],
      ['Sábado', 'Medio día', '4 horas'],
      ['Domingo', 'No cuenta', 'Va como horas extras'],
    ],
  } },
  { ojo: 'El domingo no suma días a propósito: cuando se trabaja se paga como horas extras, y sumarlo también aquí lo pagaría dos veces.' },

  { h3: 'Cómo se calcula el pago' },
  { p: 'Bruto = días × tarifa diaria + horas extras + bonificaciones. Neto = bruto − deducciones (avances entregados, descuentos por herramienta y demás). Las cuentas las hace el servidor; lo que ves mientras escribes es una vista previa.' },
  { p: 'La tarifa se copia de la del colaborador pero se puede cambiar, y queda congelada en ese pago: si mañana le suben la tarifa, este pago no se altera.' },

  { h3: 'Estados e imputación al proyecto' },
  { p: 'Un pago va de pendiente a pagado, o queda anulado. Al marcarlo como pagado, si tiene un proyecto asignado, el sistema genera automáticamente un gasto de mano de obra en ese proyecto por el importe bruto. Si se revierte o se borra el pago, ese gasto desaparece con él.' },

  { h3: 'El recibo' },
  { p: 'Desde el menú de cada pago se imprime el recibo. Trae el desglose completo, no solo el neto —quien firma debe poder comprobar cómo se llegó a la cifra—, y cierra con la declaración de conformidad y dos firmas: la del beneficiario, con su nombre y cédula, y la de quien entrega.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '8. Administración' },

  { h2: '8.1 Usuarios' },
  { p: 'Alta de cuentas y asignación de roles. Solo un administrador entra aquí. Conviene revisar la lista cada cierto tiempo y desactivar a quien ya no debe tener acceso: desactivar es mejor que borrar, porque conserva el rastro de lo que esa persona registró.' },

  { h2: '8.2 Configuración' },
  { p: 'Los datos de la empresa que salen impresos en cotizaciones, recibos y reportes: nombre, RNC, logo, dirección, teléfonos y términos y condiciones por defecto. Cambiarlos aquí los cambia en todos los documentos que se generen a partir de ese momento.' },
  { ojo: 'Los documentos ya generados conservan los datos que tenían. Es lo correcto: una cotización enviada no debe cambiar sola.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '9. Correos y avisos automáticos' },

  { p: 'El sistema envía correos solo. No hay que acordarse de nada de esto:' },
  { tabla: {
    cabeceras: ['Cuándo', 'Qué envía', 'A quién'],
    anchos: [24, 46, 30],
    filas: [
      ['Al enviar una cotización', 'El PDF con los botones de aprobar y rechazar', 'Al cliente'],
      ['Todos los días, 8:00 a.m.', 'Aviso de cotizaciones que vencen en tres días', 'Al equipo'],
      ['Todos los días, 8:00 a.m.', 'Aviso de tareas vencidas', 'Al equipo'],
      ['Todos los días, 9:00 a.m.', 'Recordatorio de cotizaciones sin respuesta (máximo dos por envío)', 'Al cliente'],
      ['Lunes, 9:00 a.m.', 'Resumen de pagos pendientes de cobro', 'Al equipo'],
      ['Al decidir el cliente', 'Aviso de que aprobó o rechazó', 'Al equipo'],
    ],
  } },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '10. Preguntas frecuentes' },

  { h3: 'La página no carga' },
  { p: 'Casi siempre es la VPN. Comprueba que estás conectado antes de cualquier otra cosa.' },

  { h3: 'No veo un módulo que sí ve un compañero' },
  { p: 'Es el rol. Reportes y Nómina requieren Gerente; Usuarios y Configuración, Administrador. Un administrador puede cambiarte el rol si tu trabajo lo necesita.' },

  { h3: 'No puedo editar una cotización' },
  { p: 'Si está aprobada o rechazada, queda bloqueada. Para cambiarla se crea una revisión, que conserva la anterior como histórico.' },

  { h3: 'No aparece el botón de convertir en proyecto' },
  { p: 'Solo sale en cotizaciones aprobadas que aún no tienen proyecto.' },

  { h3: 'Registré un precio equivocado' },
  { p: 'No se edita: se anula indicando el motivo y se registra el correcto. Los dos quedan en el historial, y así se ve qué pasó.' },

  { h3: 'La importación de precios no arranca' },
  { p: 'La lectura del PDF ocurre en segundo plano y puede tardar minutos. Si el lote queda en fallido, el motivo aparece en la propia pantalla del lote.' },

  { h3: '¿Dónde están los archivos que subo?' },
  { p: 'En el ERP, dentro del cliente o el proyecto, y también en Nextcloud, en la carpeta "Proyectos ERP", con su nombre original.' },

  // ══════════════════════════════════════════════════════════════════════════
  { h1: '11. Glosario de estados' },

  { h2: 'Proyectos' },
  { tabla: {
    cabeceras: ['Estado', 'Significado'],
    anchos: [26, 74],
    filas: [
      ['Pendiente', 'Registrado, todavía no arranca.'],
      ['En curso', 'En ejecución.'],
      ['En pausa', 'Detenido temporalmente.'],
      ['Completado', 'Terminado.'],
      ['Cancelado', 'No se ejecutará.'],
    ],
  } },

  { h2: 'Tareas' },
  { tabla: {
    cabeceras: ['Estado', 'Significado'],
    anchos: [26, 74],
    filas: [
      ['Pendiente', 'Asignada, sin empezar.'],
      ['En curso', 'Alguien está trabajando en ella.'],
      ['En revisión', 'Terminada, a la espera de visto bueno.'],
      ['Completada', 'Cerrada. Guarda la fecha de cierre.'],
      ['Cancelada', 'Ya no se hará.'],
    ],
  } },

  { h2: 'Pagos y nómina' },
  { tabla: {
    cabeceras: ['Módulo', 'Estados'],
    anchos: [22, 78],
    filas: [
      ['Pagos', 'Pendiente · Completado · Fallido · Reembolsado'],
      ['Nómina', 'Pendiente · Pagado · Anulado'],
    ],
  } },

  { h2: 'Importación de precios' },
  { tabla: {
    cabeceras: ['Estado del lote', 'Significado'],
    anchos: [26, 74],
    filas: [
      ['En cola', 'Esperando a ser procesado.'],
      ['Extrayendo', 'El sistema está leyendo el PDF.'],
      ['Por revisar', 'Listo para que una persona apruebe los renglones.'],
      ['Revisado', 'No queda ningún renglón pendiente.'],
      ['Falló', 'La lectura no se pudo completar. El motivo aparece en el lote.'],
    ],
  } },
];

module.exports = { CONTENIDO, VERSION };
