import { LogoUpload } from '@/components/settings/logo-upload'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">Ajustes generales del sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo de la empresa</CardTitle>
          <CardDescription>
            Este logo aparecerá en las cotizaciones generadas en PDF. Formatos aceptados: JPG, PNG, WEBP. Máximo 10 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUpload />
        </CardContent>
      </Card>
    </div>
  )
}
