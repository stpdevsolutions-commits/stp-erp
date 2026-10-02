import { redirect } from 'next/navigation'

// Costos no tiene portada propia: el menú abre directo en Materiales y precios.
// Sin esto, /dashboard/costos (escrito a mano o desde un enlace viejo) daba 404.
export default function CostosPage() {
  redirect('/dashboard/costos/materiales')
}
