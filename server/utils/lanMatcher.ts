import { createHash, randomBytes } from 'node:crypto'

// salt 防止 IPv4 32-bit 空间被反向暴力枚举公网 IP（rainbow attack）
// 生产环境建议设 LD_LAN_HASH_SALT 持久化（否则每次重启 fingerprint 会变，客户端 opt-out 记录失效）
const LAN_HASH_SALT = process.env.LD_LAN_HASH_SALT ?? randomBytes(16).toString('hex')

export function isSameLan(ipA: string, ipB: string): boolean {
  return ipA === ipB && ipA.length > 0
}

// 公网 IP 的 hash → 12 字节 hex，避免把原始 IP 暴露给客户端
export function lanRoomIdOf(publicIp: string): string {
  return createHash('sha256').update(`lan-room:${LAN_HASH_SALT}:${publicIp}`).digest('hex').slice(0, 12)
}

type HeadersLike = Headers | Record<string, string | string[] | undefined>

function getHeader(headers: HeadersLike, key: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined
  }
  const direct = headers[key] ?? headers[key.toLowerCase()]
  if (Array.isArray(direct)) return direct[0]
  return direct
}

// design.md §13.4：反代部署必须透传 X-Forwarded-For，否则全员同 IP
export function extractPublicIp(headers: HeadersLike, fallback?: string | null): string {
  const trustProxy = process.env.LD_TRUST_PROXY !== 'false'
  if (trustProxy) {
    const xff = getHeader(headers, 'x-forwarded-for')
    if (xff) {
      const first = xff.split(',')[0]?.trim()
      if (first) return first
    }
    const real = getHeader(headers, 'x-real-ip')
    if (real) return real.trim()
  }
  const raw = (fallback && fallback.length > 0) ? fallback : '0.0.0.0'
  return normalizeIp(raw)
}

// 归一化：
// - IPv6 loopback ::1 → 127.0.0.1（让同机多浏览器走同一 LAN 房间）
// - IPv4-mapped IPv6 ::ffff:127.0.0.1 → 127.0.0.1
// - 其他 IPv4-mapped IPv6 ::ffff:a.b.c.d → a.b.c.d（IPv4/IPv6 双栈下同一公网出口归一）
// - 原生 IPv6：归一到 /64 前缀。IPv6 没 NAT，每台设备一个独立 GUA，但家庭宽带通常被
//   ISP 分配一个 /64（甚至 /56 ~ /60），同 /64 内的设备视为同一 LAN。否则同户两台机
//   会拿到不同 lanRoomId，永远互相看不到。
function normalizeIp(ip: string): string {
  if (ip === '::1') return '127.0.0.1'
  if (ip.startsWith('::ffff:')) {
    const tail = ip.slice(7)
    // 仅当 tail 看起来是 IPv4 时才剥前缀
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) return tail
  }
  if (ip.includes(':')) {
    const prefix = ipv6Prefix64(ip)
    if (prefix) return prefix
  }
  return ip
}

function ipv6Prefix64(ip: string): string | null {
  const parts = expandIpv6(ip)
  if (!parts) return null
  const head = parts.slice(0, 4).map(p => p.replace(/^0+(?=.)/, '')).join(':')
  return `${head}::/64`
}

function expandIpv6(ip: string): string[] | null {
  if (ip.includes('::')) {
    const [head, tail] = ip.split('::')
    const headParts = head ? head.split(':') : []
    const tailParts = tail ? tail.split(':') : []
    const fill = 8 - headParts.length - tailParts.length
    if (fill < 0) return null
    return [...headParts, ...Array(fill).fill('0'), ...tailParts]
  }
  const parts = ip.split(':')
  if (parts.length !== 8) return null
  return parts
}
