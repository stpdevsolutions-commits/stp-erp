import { z } from 'zod'

/**
 * Mensajes de validación de Zod en español para todos los formularios.
 *
 * Sin esto, un campo obligatorio que nunca se tocó (p. ej. el select de
 * Proyecto) mostraba el texto crudo de Zod en inglés: "Invalid input:
 * expected string, received undefined". Los mensajes propios de cada esquema
 * (`.min(2, 'Mínimo 2 caracteres')`) siguen mandando sobre estos.
 */
z.config({
  ...z.locales.es(),
  customError: (issue) => {
    if (
      issue.code === 'invalid_type' &&
      (issue.input === undefined || issue.input === null || issue.input === '')
    ) {
      return 'Este campo es obligatorio'
    }
    return undefined
  },
})
