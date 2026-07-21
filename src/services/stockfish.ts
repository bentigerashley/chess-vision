export type EngineLine = { rank: number; evaluation: string; depth: number; moves: string }

const infoPattern = /\bdepth (\d+).*?\bmultipv (\d+).*?\bscore (cp|mate) (-?\d+).*?\bpv (.+)$/

export function parseEngineInfo(line: string): EngineLine | undefined {
  const match = infoPattern.exec(line.trim())
  if (!match) return undefined
  const [, depth, rank, scoreKind, scoreValue, moves] = match
  const numericScore = Number(scoreValue)
  return {
    rank: Number(rank),
    depth: Number(depth),
    evaluation: scoreKind === 'mate'
      ? `${numericScore > 0 ? '+' : ''}M${numericScore}`
      : `${numericScore >= 0 ? '+' : ''}${(numericScore / 100).toFixed(2)}`,
    moves,
  }
}

export class UciLineBuffer {
  private remainder = ''

  push(chunk: string) {
    const complete = `${this.remainder}${chunk}`.split(/\r?\n/)
    this.remainder = complete.pop() ?? ''
    return complete.filter(Boolean)
  }

  flush() {
    const finalLine = this.remainder.trim()
    this.remainder = ''
    return finalLine ? [finalLine] : []
  }
}

export class EngineSearchOutput {
  private readonly buffer = new UciLineBuffer()
  private readonly principalVariations = new Map<number, EngineLine>()

  consume(chunk: string) {
    let protocolLines = this.buffer.push(chunk)
    if (chunk.includes('bestmove ')) protocolLines = [...protocolLines, ...this.buffer.flush()]
    for (const line of protocolLines) this.consumeLine(line)
    return { complete: protocolLines.some(line => line.startsWith('bestmove')), lines: this.lines(), protocolLines }
  }

  /**
   * The native bridge emits one UCI line per event after it has removed the
   * newline. Keep the generic chunk parser above for streamed/browser output,
   * but do not wait for a delimiter that this bridge will never send.
   */
  consumeNativeCallback(output: string) {
    const protocolLines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    for (const line of protocolLines) this.consumeLine(line)
    return { complete: protocolLines.some(line => line.startsWith('bestmove')), lines: this.lines(), protocolLines }
  }

  finish() {
    for (const line of this.buffer.flush()) this.consumeLine(line)
    return this.lines()
  }

  private consumeLine(line: string) {
    const engineLine = parseEngineInfo(line)
    if (engineLine) this.principalVariations.set(engineLine.rank, engineLine)
  }

  private lines() {
    return [...this.principalVariations.values()].sort((left, right) => left.rank - right.rank).slice(0, 3)
  }
}
