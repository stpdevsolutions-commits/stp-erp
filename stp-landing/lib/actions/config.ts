// Constantes compartidas por los server actions.
// IMPORTANTE: este archivo NO lleva 'use server'. Los archivos con 'use server'
// solo pueden exportar funciones async, así que las constantes deben vivir aquí.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
