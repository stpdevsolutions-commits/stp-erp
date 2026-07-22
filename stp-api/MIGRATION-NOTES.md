# Notas de Migración — Drift de `InitialSchema`

> Documento informativo. NO ejecuta cambios. Generado tras auditar el drift
> entre `src/migrations/1780694236262-InitialSchema.ts` y el schema real que
> `synchronize: true` mantiene en la BD de desarrollo.

## Contexto

- **Dev**: `synchronize: true` → TypeORM ajusta el schema automáticamente desde las entities.
- **Prod**: `synchronize: false`, `migrationsRun: true` → el schema se crea/actualiza SOLO con las migraciones de `src/migrations/`.

Como en dev el schema se mantiene con `synchronize`, la migración `InitialSchema`
quedó desactualizada. Un deploy en **producción con BD fresca** crearía tablas
sin las columnas que faltan → los `INSERT`/`SELECT` de esas columnas fallarían
en runtime.

## Drift detectado (comparación migración vs BD real)

Se compararon las 15 tablas de entities. **El único drift de columnas** es:

| Tabla         | Columna       | Definición real en BD                          | ¿En la migración? |
|---------------|---------------|------------------------------------------------|:-----------------:|
| `quote_items` | `discountPct` | `numeric(5,2) NOT NULL DEFAULT 0`              | ❌ falta          |
| `quote_items` | `sectionName` | `character varying NULL`                        | ❌ falta          |

- No hay tablas faltantes (las 15 entities están en la migración; `migrations` es la tabla interna de TypeORM).
- El resto de tablas (incluida `quotes`) coincide columna por columna.
- No se auditó a fondo drift de índices/constraints, pero las columnas — que es lo que rompe INSERT/SELECT — están cubiertas arriba.

## ALTER equivalente (referencia — NO ejecutar contra la BD viva)

La BD viva YA tiene estas columnas (las creó `synchronize`). Esto es solo para
entender qué le falta a la migración:

```sql
ALTER TABLE "quote_items" ADD "discountPct" numeric(5,2) NOT NULL DEFAULT '0';
ALTER TABLE "quote_items" ADD "sectionName" character varying;
```

## Plan recomendado para regenerar el baseline (ventana controlada)

Ejecutar **fuera de horario**, entendiendo que toca la CLI de TypeORM. La
generación en sí NO modifica la BD; solo produce un archivo `.ts`.

1. Asegurar que las entities están al día y la BD dev refleja el estado deseado (lo está vía `synchronize`).
2. Generar una migración incremental con el diff actual:

   ```bash
   docker exec stp-api sh -c "./node_modules/.bin/ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/migrations/QuoteItemsDiscountSection -d src/data-source.ts"
   ```

   Debería emitir exactamente los dos `ADD COLUMN` de arriba.
3. Revisar el archivo generado (que NO incluya `DROP`/re-creaciones inesperadas por diferencias de `synchronize`).
4. En un entorno de **prod fresco**, correr todas las migraciones en orden:

   ```bash
   docker exec stp-api sh -c "./node_modules/.bin/ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d src/data-source.ts"
   ```

### Alternativa: regenerar el baseline completo desde cero

Solo si se quiere un `InitialSchema` limpio (requiere BD vacía de referencia):

1. Levantar una BD Postgres vacía temporal.
2. Borrar/renombrar la migración vieja y generar una nueva contra esa BD vacía
   con `synchronize` desactivado, usando `migration:generate`.
3. Verificar que el archivo generado incluye `quote_items.discountPct` y
   `quote_items.sectionName`, y todas las tablas.

> ⚠️ Nunca correr `migration:run`/`migration:generate` contra la BD de
> producción viva sin backup y ventana de mantenimiento. En dev, `synchronize`
> ya mantiene el schema, así que las migraciones solo importan para deploys de
> prod con BD nueva.
</content>
</invoke>
