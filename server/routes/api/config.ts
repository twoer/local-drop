// 客户端启动时拉取 STUN/TURN 配置（design.md §13.3）
// 避免把 ICE 服务器列表硬编码进前端 bundle

export default defineEventHandler(() => {
  const stunPrimary = process.env.LD_STUN_PRIMARY ?? 'stun:stun.l.google.com:19302'
  const stunBackup = process.env.LD_STUN_BACKUP ?? 'stun:stun.qq.com:3478'
  const turnUrl = process.env.LD_TURN_URL
  const turnUsername = process.env.LD_TURN_USERNAME
  const turnCredential = process.env.LD_TURN_CREDENTIAL
  const wanMaxFileSize = process.env.LD_WAN_MAX_FILE_SIZE
    ? Number.parseInt(process.env.LD_WAN_MAX_FILE_SIZE, 10)
    : 100 * 1024 * 1024 // 默认 100 MB

  const iceServers: RTCIceServer[] = [
    { urls: stunPrimary },
    { urls: stunBackup },
  ]
  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    })
  }

  return { iceServers, wanMaxFileSize }
})
