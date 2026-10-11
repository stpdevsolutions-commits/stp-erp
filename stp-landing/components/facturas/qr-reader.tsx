'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { ImageIcon, Zap, ZapOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Ancho máximo al que se analiza cada cuadro con jsQR. El QR de un e-CF es denso (una URL larga):
 * reducirlo mucho lo vuelve ilegible, por eso se analiza a casi la resolución de la cámara.
 */
const MAX_WIDTH = 1280

type NativeDetector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/** El lector nativo del sistema (Android/Chrome); en iPhone no existe y se usa jsQR. */
function nativeDetector(): NativeDetector | null {
  const Ctor = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector }).BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

function decode(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement): string | null {
  const scale = Math.min(1, MAX_WIDTH / width)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  return jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

/**
 * Lee el código QR de un e-CF con la cámara (en vivo) o desde una foto. Devuelve el texto del
 * QR sin interpretarlo: el servidor lo valida y lo consulta en la DGII. En iPhone la cámara
 * pide permiso la primera vez y solo funciona por HTTPS (el ERP lo es).
 */
export function QrReader({ onResult, onCancel }: { onResult: (text: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const onResultRef = useRef(onResult)
  const [message, setMessage] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    let lastTry = 0
    let busy = false
    const detector = nativeDetector()

    function stop() {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }

    function found(text: string) {
      stop()
      onResultRef.current(text)
    }

    function tick(now: number) {
      if (stopped) return
      frame = requestAnimationFrame(tick)
      if (busy || now - lastTry < 120) return
      lastTry = now
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return
      if (detector) {
        busy = true
        detector
          .detect(video)
          .then((codes) => {
            const raw = codes.find((c) => c.rawValue)?.rawValue
            if (raw && !stopped) found(raw)
            else if (!stopped) {
              const text = decode(video, video.videoWidth, video.videoHeight, canvas)
              if (text) found(text)
            }
          })
          .catch(() => {
            const text = decode(video, video.videoWidth, video.videoHeight, canvas)
            if (text && !stopped) found(text)
          })
          .finally(() => {
            busy = false
          })
        return
      }
      const text = decode(video, video.videoWidth, video.videoHeight, canvas)
      if (text) found(text)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('Este navegador no deja usar la cámara aquí. Elige una foto del código QR.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Alta resolución: con los 640x480 por defecto un QR denso no se distingue.
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        const track = stream.getVideoTracks()[0]
        trackRef.current = track ?? null
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          torch?: boolean
          focusMode?: string[]
        }
        // Enfoque continuo cuando el dispositivo lo permite (Android); iPhone ya lo hace solo.
        if (caps.focusMode?.includes('continuous')) {
          void track
            .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
            .catch(() => {})
        }
        setTorchAvailable(Boolean(caps.torch))
        video.srcObject = stream
        await video.play()
        setCameraOn(true)
        frame = requestAnimationFrame(tick)
      } catch {
        setMessage('No se pudo abrir la cámara (¿negaste el permiso?). Puedes elegir una foto del código QR.')
      }
    }

    void start()
    return stop
  }, [])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  async function fromPhoto(file: File) {
    setMessage(null)
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = canvasRef.current
      const text = canvas ? decode(bitmap, bitmap.width, bitmap.height, canvas) : null
      bitmap.close()
      if (text) onResultRef.current(text)
      else setMessage('No se encontró un código QR en esa foto. Acércate más al código y que se vea completo y enfocado.')
    } catch {
      setMessage('No se pudo leer esa imagen.')
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Leer el código QR del e-CF</p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cerrar el lector">
          <X className="size-4" />
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
        {cameraOn && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="size-2/3 max-w-64 rounded-xl border-2 border-white/80" />
          </div>
        )}
        {cameraOn && torchAvailable && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? 'Apagar el flash' : 'Encender el flash'}
            aria-pressed={torchOn}
            className="absolute bottom-2 right-2 size-11 rounded-full"
          >
            {torchOn ? <Zap className="size-5 fill-current" /> : <ZapOff className="size-5" />}
          </Button>
        )}
        {!cameraOn && !message && (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Abriendo la cámara…</p>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {message && <p className="text-sm text-amber-700">{message}</p>}
      {cameraOn && <p className="text-xs text-muted-foreground">Apunta al código QR de la factura; se lee solo.</p>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <ImageIcon className="size-4 mr-1" />
          Elegir foto del QR
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void fromPhoto(file)
          }}
        />
      </div>
    </div>
  )
}
