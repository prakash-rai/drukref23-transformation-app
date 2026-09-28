import type { SelectHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn('flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200', className)} {...props} /> }
