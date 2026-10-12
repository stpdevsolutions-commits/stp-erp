# Registrar facturas enviando la foto por WhatsApp (2026-10-11)

Ticket: **ERP** "Registrar facturas enviando la foto por WhatsApp" (STP Tickets).

## Qué hace
Un usuario del ERP manda la foto (o el PDF) de una factura al número de WhatsApp del ERP:
1. El bot la descarga, la lee con el mismo escáner de IA de la pantalla **Escanear** y responde con lo que leyó (emisor, NCF, fecha, total, tipo de gasto, avisos).
2. Pregunta el destino con tres botones: **Un proyecto**, **Gasto general** o **Sin asignar**. Con "Un proyecto" muestra una lista de **9 proyectos activos por página** (los más recientes) y una décima fila **Ver más proyectos** (WhatsApp admite 10 filas por lista). También se puede escribir parte del nombre, del código o del cliente para buscar entre todos los no cancelados. Escribir "cancelar" sale en cualquier momento.
3. Pide confirmación con botones (**Guardar / Cambiar destino / Cancelar**).
4. Al guardar crea la factura (y su gasto según el destino), adjunta la foto, valida e-CF en la DGII en segundo plano y confirma en el chat.

## Reglas de seguridad
- **Solo números guardados en la ficha de un usuario activo** con permiso de gestión del módulo Facturas (admin y finanzas). Cualquier otro número: no se descarga nada, no se llama a la IA; recibe una respuesta automática corta como máximo **una vez al día** (texto configurable con `WHATSAPP_AUTOREPLY_TEXT`).
- **Nunca guarda sin confirmación.** Un doble toque en Guardar no duplica (la sesión se borra antes de guardar; además existe el aviso de duplicado por NCF + RNC).
- **Requiere la firma de Meta:** los mensajes entrantes solo se procesan si `WHATSAPP_APP_SECRET` está configurado y la firma `X-Hub-Signature-256` es válida. Sin el secreto el flujo queda inactivo (se ignoran con un aviso en el log) porque, si no, cualquiera que conozca la URL del webhook podría hacerse pasar por un usuario.
- La descarga de archivos solo acepta direcciones de Meta (fbsbx.com, whatsapp.net, fbcdn.net, facebook.com) y máximo 8 MB; el enlace de Meta caduca a los 5 minutos.
- Una lectura sin NCF, RNC, nombre, fecha o monto no se guarda: avisa y manda a usar Escanear en el ERP. Si no se pudo deducir el tipo de gasto se usa "02" y se avisa para revisarlo.

## Costos y riesgos
- Recibir mensajes no cuesta. Según la documentación de Meta, los mensajes sin plantilla dentro de las 24 h del mensaje del usuario son gratis. (Algunas fuentes de terceros hablan de un cambio el 1-oct-2026 con 1,000 respuestas gratis al mes por número; Meta no lo confirma. Revisar la tarifa vigente.)
- El número lo usan también los clientes: nadie responde allí. Si lo bloquean o reportan baja la calidad del número (y con ella los límites de envío de las plantillas de tareas). Mitigación: respuesta automática única diaria. Mejor solución a futuro: un número aparte para uso interno.

## Dónde está el código (`stp-api/src`)
- `notifications/whatsapp-inbox.service.ts`: buzón de entrantes + `parseInboundMessages` (spec incluido) — evita un ciclo entre módulos.
- `notifications/whatsapp-webhook.controller.ts`: entrega los mensajes al buzón solo con firma válida.
- `notifications/whatsapp.service.ts`: `sendText`, `sendButtons`, `sendList`, `downloadMedia`.
- `fiscal-invoices/whatsapp-invoice-flow.service.ts`: la conversación (en memoria, 20 min; si el servidor se reinicia a medias, se reenvía la foto).

## Estado y hallazgos de la puesta en marcha (2026-10-11)
- Probado de punta a punta con un teléfono real: una factura ya registrada se detectó como duplicada y una nueva se leyó, se eligió proyecto, se confirmó y se registró.
- La app de Meta ("STP ERP - Mensajes") está **En desarrollo** y aun así entrega los mensajes reales: no hace falta publicarla. El campo `messages` ya estaba suscrito.
- `WHATSAPP_APP_SECRET` quedó configurado en el `.env`; sin él el flujo ignora los mensajes.
- La `ANTHROPIC_API_KEY` del servidor está inválida (HTTP 401): el lector de facturas se pasó a **Gemini** con `INVOICE_SCAN_PROVIDER=gemini` en el `.env` (también arregla Escanear en el ERP). Para volver a Claude: clave nueva en console.anthropic.com y quitar esa línea.

## Puesta en marcha (una sola vez, ya hecha)
1. Agregar `WHATSAPP_APP_SECRET` al `.env` del servidor (Meta for Developers → la app → Configuración → Básica → Clave secreta) y reiniciar `stp-api`.
2. Comprobar que el webhook de la app tiene suscrito el campo **messages** (hoy se usaba para estados de entrega).
3. Verificar que cada usuario que lo usará tiene su teléfono en la ficha.
4. Probar con un teléfono real.
