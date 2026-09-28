import type { ButtonHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export function Button({ className, variant = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' }) {
  return <button className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50', variant === 'default' && 'bg-slate-900 text-white shadow-sm hover:bg-slate-700', variant === 'outline' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50', variant === 'ghost' && 'text-slate-600 hover:bg-slate-100', className)} {...props} />
}
