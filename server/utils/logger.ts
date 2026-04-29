type Data = Record<string, unknown> | undefined

const stamp = () => new Date().toISOString()

function fmt(level: string, event: string, data: Data) {
  const base = `[${stamp()}] [${level}] ${event}`
  return data && Object.keys(data).length > 0 ? `${base} ${JSON.stringify(data)}` : base
}

export const logger = {
  info(event: string, data?: Data) {
    console.log(fmt('info', event, data))
  },
  warn(event: string, data?: Data) {
    console.warn(fmt('warn', event, data))
  },
  error(event: string, data?: Data) {
    console.error(fmt('error', event, data))
  },
}
