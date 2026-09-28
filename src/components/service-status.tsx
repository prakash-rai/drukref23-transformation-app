import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react'

type Health = 'checking' | 'online' | 'offline'

export function ServiceStatus({ health, reason }: { health: Health; reason?: string }) {
  const config = health === 'online' ? { label: 'Service online', color: 'text-emerald-600', dot: 'bg-emerald-500' } : health === 'offline' ? { label: 'Service unavailable', color: 'text-red-600', dot: 'bg-red-500' } : { label: 'Checking service', color: 'text-slate-600', dot: 'bg-slate-500' }
  const Icon = health === 'online' ? CheckCircle2 : health === 'offline' ? CircleAlert : Loader2
  return <span title={health === 'offline' ? reason : undefined} className={`flex items-center gap-2 text-sm ${config.color}`}><span className={`inline-block h-2 w-2 rounded-full ${config.dot}`} />{config.label}<Icon size={15} className={health === 'checking' ? 'animate-spin motion-reduce:animate-none' : ''} /></span>
}

/** Explains why the service is unavailable, so staff can act on it instead of guessing. */
export function ServiceAlert({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1"><p className="font-semibold">The transformation service is unavailable</p><p className="mt-0.5 break-words text-xs leading-5 text-red-700">{reason}</p></div>
      <button type="button" onClick={onRetry} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e76f51]">Retry</button>
    </div>
  )
}
