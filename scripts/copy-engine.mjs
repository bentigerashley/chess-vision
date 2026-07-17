import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('node_modules/stockfish/bin')
const target = resolve('public/engine')
await mkdir(target, { recursive: true })
for (const name of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  await copyFile(resolve(source, name), resolve(target, name))
}
