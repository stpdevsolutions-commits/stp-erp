import { LogoUpload } from '@/components/settings/logo-upload'
import { CompanyForm } from '@/components/settings/company-form'
import { HeroUpload } from '@/components/settings/hero-upload'
import { TermsForm } from '@/components/settings/terms-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { CompanyFormData } from '@/lib/actions/settings'

export default async function ConfiguracionPage() {
  const [company, termsData, heroData, meData] = await Promise.allSettled([
    api.get<CompanyFormData>('/settings/company'),
    api.get<{ terms: string | null }>('/settings/terms'),
    api.get<{ hasImage: boolean; version: string | null; caption: string }>('/settings/hero-info'),
    api.get<{ role: string }>('/users/me'),
  ])

  const hero = heroData.status === 'fulfilled' ? heroData.value : { hasImage: false, version: null, caption: '' }
  const isAdmin = meData.status === 'fulfilled' && meData.value.role.toLowerCase() === 'admin'

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

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Imagen destacada de Inicio</CardTitle>
            <CardDescription>
              Foto del proyecto que se muestra en la pantalla de bienvenida. Cámbiala cuando cambie el proyecto destacado.
              Formatos: JPG, PNG, WEBP. Máximo 10 MB. Mejor horizontal y de al menos 1600 px de ancho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HeroUpload {...hero} />
          </CardContent>
        </Card>
      )}

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
