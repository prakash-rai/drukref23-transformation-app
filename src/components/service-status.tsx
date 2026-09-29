import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Loader2 } from 'lucide-react'

type Health = 'checking' | 'online' | 'offline'

export function ServiceStatus({ health }: { health: Health }) {
  const config = health === 'online' ? { label: 'Service online', color: 'text-emerald-600', dot: 'bg-emerald-500' } : health === 'offline' ? { label: 'Service unavailable', color: 'text-red-600', dot: 'bg-red-500' } : { label: 'Checking service', color: 'text-slate-600', dot: 'bg-slate-500' }
  const Icon = health === 'online' ? CheckCircle2 : health === 'offline' ? CircleAlert : Loader2
  return <span className={`flex items-center gap-2 text-sm ${config.color}`}><span className={`inline-block h-2 w-2 rounded-full ${config.dot}`} />{config.label}<Icon size={15} className={health === 'checking' ? 'animate-spin motion-reduce:animate-none' : ''} /></span>
}

/** Tells users what to do when the service is unavailable; the technical reason is kept behind Details for the GIS admin. */
export function ServiceAlert({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1"><p className="font-semibold">The transformation service is unavailable</p><p className="mt-0.5 text-xs leading-5 text-red-700">You can still add and review datasets. Try again later, or contact the GIS administrator if this continues.</p>{reason && <><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-1 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-red-800 hover:text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e76f51]">{expanded ? 'Hide details' : 'Details'}{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>{expanded && <p className="mt-1 break-words rounded-md bg-white/60 px-2 py-1.5 font-mono text-[0.6875rem] leading-5 text-red-700">{reason}</p>}</>}</div>
      <button type="button" onClick={onRetry} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e76f51]">Retry</button>
    </div>
  )
}
