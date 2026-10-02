/**
 * Monto en pesos para PDFs y textos: "RD$ 1,234.50". Redondea a centavos y
 * trata null/undefined como 0. Antes había una copia de esta función en cada
 * generador de PDF.
 */
export function formatRD(n: number | null | undefined): string {
  const [int, dec] = (Math.round((n ?? 0) * 100) / 100).toFixed(2).split('.');
  return 'RD$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}
