import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, Info, LoaderCircle, MapPinned, PackageCheck, Upload, XCircle } from 'lucide-react'
import { getProjectionStatus, getTransformationOutcome, type ProjectionStep } from '#/lib/projection-status'
import { CUSTOM_TRANSFORMATION } from '#/lib/transformation'

type Props = { messages: string[]; error: string; busy: boolean }

const steps: Array<{ id: ProjectionStep; label: string; detail: string; Icon: typeof PackageCheck }> = [
  { id: 'prepare', label: 'Prepare', detail: 'Packaging datasets', Icon: PackageCheck },
  { id: 'upload', label: 'Upload', detail: 'Sending to ArcGIS', Icon: Upload },
  { id: 'project', label: 'Transform', detail: 'Applying the NTv2 datum transformation', Icon: MapPinned },
  { id: 'download', label: 'Download', detail: 'Getting your result', Icon: Download },
]

export function ActivityPanel({ messages, error, busy }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { activeStep, complete, failed } = getProjectionStatus({ busy, messages, error })
  const outcome = getTransformationOutcome(messages)
  const hasDatasetFailures = outcome.failed > 0
  const hasIssues = failed || hasDatasetFailures
  const activeIndex = steps.findIndex((step) => step.id === activeStep)
  const headline = failed ? 'Transformation could not be completed' : complete && hasDatasetFailures ? 'Transformation completed with issues' : complete ? 'Transformation complete' : hasDatasetFailures ? 'A dataset could not be transformed' : steps[activeIndex]?.detail
  const latestMessage = messages.at(-1) ?? 'Starting transformation…'
  const latestFailure = messages.filter((message) => /failed to transform:/i.test(message)).at(-1)
  const completionMessage = `${outcome.successful} dataset${outcome.successful === 1 ? '' : 's'} successfully transformed${hasDatasetFailures ? `; ${outcome.failed} failed. Review the failed dataset below.` : '. Your download should begin shortly.'}`

  function messageAppearance(message: string) {
    if (/failed to transform:|\berror\b/i.test(message)) return { Icon: XCircle, className: 'text-red-700', iconClassName: 'text-red-600' }
    if (/\bwarning\b/i.test(message)) return { Icon: AlertTriangle, className: 'text-amber-800', iconClassName: 'text-amber-600' }
    if (/successfully transformed\.?$/i.test(message)) return { Icon: CheckCircle2, className: 'text-emerald-800', iconClassName: 'text-emerald-600' }
    return { Icon: Info, className: 'text-[#56655c]', iconClassName: 'text-[#2f6958]' }
  }

  return (
    <section className={`overflow-hidden rounded-xl border ${hasIssues ? 'border-amber-300 bg-amber-50' : 'border-[#c9dccb] bg-[#f2f6ef]'}`} aria-labelledby="projection-activity-title">
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${failed ? 'bg-red-100 text-red-700' : hasDatasetFailures ? 'bg-amber-100 text-amber-700' : complete ? 'bg-emerald-100 text-emerald-700' : 'bg-[#173c34] text-white'}`}>
            {failed ? <XCircle size={17} /> : hasDatasetFailures ? <AlertTriangle size={17} /> : complete ? <CheckCircle2 size={17} /> : <LoaderCircle className="animate-spin motion-reduce:animate-none" size={17} />}
          </span>
          <div className="min-w-0 flex-1"><h3 id="projection-activity-title" className={`text-sm font-semibold ${hasIssues ? failed ? 'text-red-800' : 'text-amber-900' : 'text-[#173c34]'}`}>{headline}</h3><p aria-live="polite" className={`mt-0.5 text-xs leading-5 ${failed ? 'text-red-700' : hasDatasetFailures ? 'text-amber-800' : 'text-[#56655c]'}`}>{failed ? error : complete ? completionMessage : latestFailure ?? latestMessage}</p></div>
        </div>

        <ol className="mt-5 grid grid-cols-4 gap-1" aria-label="Transformation stages">
          {steps.map((step, index) => {
            const done = complete || (!failed && index < activeIndex)
            const active = !complete && !failed && index === activeIndex
            const Icon = step.Icon
            return <li key={step.id} className="relative min-w-0 text-center">
              {index > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-3 h-px w-full ${done || active ? 'bg-[#2f6958]' : 'bg-[#c9dccb]'}`} />}
              <span className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full border ${done ? 'border-[#2f6958] bg-[#2f6958] text-white' : active ? 'border-[#173c34] bg-white text-[#173c34] shadow-[0_0_0_4px_rgba(47,105,88,0.12)]' : 'border-[#b9cbbd] bg-[#f2f6ef] text-[#68766d]'}`}><Icon size={13} /></span>
              <span className={`mt-1.5 block text-[0.6875rem] font-semibold ${done || active ? 'text-[#173c34]' : 'text-[#68766d]'}`}>{step.label}</span>
            </li>
          })}
        </ol>
      </div>

      {messages.length > 0 && <div className="border-t border-[#d7ddd5] bg-white/60 px-4 py-2 sm:px-5"><p className="pt-2 text-xs text-[#56655c]">Using NTv2: {CUSTOM_TRANSFORMATION}</p><button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-xs font-semibold text-[#2f6958] hover:text-[#173c34] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e76f51]" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide activity details' : `View activity details (${messages.length})`}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{expanded && <ol className="mt-2 space-y-1.5 border-t border-[#d7ddd5] pt-2 text-xs leading-5">{messages.map((message, index) => { const appearance = messageAppearance(message); const Icon = appearance.Icon; return <li key={`${message}-${index}`} className={`flex gap-2 ${appearance.className}`}><Icon className={`mt-0.5 shrink-0 ${appearance.iconClassName}`} size={14} />{message}</li> })}</ol>}</div>}
    </section>
  )
}
