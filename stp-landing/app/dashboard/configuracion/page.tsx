import { LogoUpload } from '@/components/settings/logo-upload'
import { CompanyForm } from '@/components/settings/company-form'
import { TermsForm } from '@/components/settings/terms-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { CompanyFormData } from '@/lib/actions/settings'

export default async function ConfiguracionPage() {
  const [company, termsData] = await Promise.allSettled([
    api.get<CompanyFormData>('/settings/company'),
    api.get<{ terms: string | null }>('/settings/terms'),
  ])

  const terms = termsData.status === 'fulfilled' ? (termsData.value.terms ?? '') : ''

  const companyDefaults = company.status === 'fulfilled' ? company.value : {
    name: 'Soluciones Técnicas Profesionales',
    shortName: 'STP',
    rnc: '132943058',
    address1: 'Calle Bonanza #58, Loyola, Herrera',
    address2: 'Santo Domingo Oeste, República Dominicana',
    phones: '809-537-6566 / 809-350-9162',
    email: 'proyectos@stpsoluciones.com',
    website: 'stpsoluciones.com',
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">Ajustes generales del sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la empresa</CardTitle>
          <CardDescription>
            Esta información aparece en el encabezado y pie de todos los documentos PDF generados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyForm defaults={companyDefaults} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo de la empresa</CardTitle>
          <CardDescription>
            Aparece en el encabezado de los PDFs. Formatos aceptados: JPG, PNG, WEBP. Máximo 10 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUpload />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Términos y condiciones por defecto</CardTitle>
          <CardDescription>
            Texto que se pre-llena en el campo de términos al crear una nueva cotización.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TermsForm defaultTerms={terms} />
        </CardContent>
      </Card>
    </div>
  )
}
