// ANSI styling and log helpers (no dependencies).

const paint = (code) => (text) =>
  process.stdout.isTTY ? `[${code}m${text}[0m` : String(text)

export const bold = paint('1')
export const dim = paint('2')
export const red = paint('31')
export const green = paint('32')
export const yellow = paint('33')
export const cyan = paint('36')

export const error = (msg) => console.error(`${red(bold('error'))} ${msg}`)
export const success = (msg) => console.log(`${green('✔')} ${msg}`)
export const info = (msg) => console.log(`${cyan('ℹ')} ${msg}`)
export const warn = (msg) => console.log(`${yellow('▲')} ${msg}`)
