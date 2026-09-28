import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export function Button({ className, variant = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' }) {
  return <button className={cn('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:pointer-events-none disabled:opacity-50', variant === 'default' && 'bg-sky-500 text-slate-950 hover:bg-sky-400', variant === 'outline' && 'border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800', variant === 'ghost' && 'text-slate-400 hover:bg-slate-800 hover:text-slate-100', className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/10', className)} {...props} />
}

export function Badge({ className, children }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-xs font-medium text-sky-300', className)}>{children}</span>
}
