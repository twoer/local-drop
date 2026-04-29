// 4 位纯数字配对码池（0000–9999）
// 随机起点 + 线性探测：高占用率时仍然 O(N)，低占用率近似常数
export class CodePool {
  private readonly inUse = new Set<string>()
  private readonly capacity: number

  constructor(capacity = 10_000) {
    this.capacity = capacity
  }

  alloc(): string | null {
    if (this.inUse.size >= this.capacity) return null
    const start = Math.floor(Math.random() * this.capacity)
    for (let i = 0; i < this.capacity; i++) {
      const n = (start + i) % this.capacity
      const code = String(n).padStart(4, '0')
      if (!this.inUse.has(code)) {
        this.inUse.add(code)
        return code
      }
    }
    return null
  }

  release(code: string): void {
    this.inUse.delete(code)
  }

  has(code: string): boolean {
    return this.inUse.has(code)
  }

  get size(): number {
    return this.inUse.size
  }
}

export const codePool = new CodePool()
