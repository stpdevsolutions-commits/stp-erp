/**
 * Prepara la foto de una factura antes de mandarla al servidor (lectura con IA y archivo guardado).
 *
 * - NUNCA reduce a la baja una foto razonable: si ya es JPG/PNG/WEBP, mide hasta MAX_SIDE px de lado
 *   largo y pesa poco, se manda tal cual (sin volver a comprimir).
 * - Si es más grande (fotos de 12-48 MP: 4000x3000 y más) se reduce a MAX_SIDE px de lado largo y se
 *   guarda como JPG de calidad 0.88: se lee igual de bien, pesa ~0.5-1 MB y no choca con el tope de
 *   8 MB del servidor. Respeta la orientación EXIF (se "hornea" al dibujar).
 * - Si el navegador entrega otro formato (HEIC en iPhone) y puede decodificarlo, lo convierte a JPG.
 * - Los PDF y cualquier archivo que el navegador no pueda decodificar pasan intactos.
 */
const MAX_SIDE = 2400
const MAX_PASSTHROUGH_BYTES = 6 * 1024 * 1024
const JPEG_QUALITY = 0.88
const DIRECT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function decode(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    try {
      // Safari antiguo no admite las opciones: sin ellas ya aplica la orientación EXIF.
      return await createImageBitmap(file)
    } catch {
      return null
    }
  }
}

export async function prepareInvoiceImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await decode(file)
  if (!bitmap) return file

  try {
    const { width, height } = bitmap
    const longSide = Math.max(width, height)
    const direct = DIRECT_TYPES.includes(file.type)
    if (direct && longSide <= MAX_SIDE && file.size <= MAX_PASSTHROUGH_BYTES) return file

    const scale = Math.min(1, MAX_SIDE / longSide)
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff' // un PNG con transparencia no debe quedar negro al pasar a JPG
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) return file
    // Si por algún motivo quedó más grande y el original ya era un formato válido, se deja el original.
    if (direct && blob.size >= file.size && file.size <= MAX_PASSTHROUGH_BYTES) return file

    const base = file.name.replace(/\.[^.]+$/, '') || 'factura'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}
