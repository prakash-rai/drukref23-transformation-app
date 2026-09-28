export type ProjectionStep = 'prepare' | 'upload' | 'project' | 'download'

type Input = { busy: boolean; messages: string[]; error: string }

export function getTransformationOutcome(messages: string[]) {
  const successful = messages.filter((message) => /successfully transformed\.?$/i.test(message)).length
  const failed = messages.filter((message) => /failed to transform:/i.test(message)).length
  return { successful, failed }
}

export function getProjectionStatus({ busy, messages, error }: Input) {
  const history = messages.join(' ').toLowerCase()
  const complete = !error && /projection completed|transformation completed|result download/.test(history)
  const activeStep: ProjectionStep = complete || /download|retriev/.test(history)
    ? 'download'
    : /esrijob|projecting|submitted/.test(history)
      ? 'project'
      : /uploading/.test(history)
        ? 'upload'
        : 'prepare'

  return { activeStep, complete, failed: Boolean(error), inProgress: busy && !error && !complete }
}
