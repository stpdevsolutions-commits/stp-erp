import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function apiError(err: unknown, fallback: string): string {
  const obj = err as { message?: string | string[] }
  if (Array.isArray(obj?.message)) return obj.message.join(', ')
  return (obj?.message as string | undefined) ?? fallback
}
