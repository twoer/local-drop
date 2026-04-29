// design.md §5.7：MIME 兜底（File.type 为空时回退到扩展名）

const EXT_MIME_MAP: Record<string, string> = {
  // 图片
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  // 视频
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/mp4',
  avi: 'video/x-msvideo',
  // 音频
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  // 文档/压缩
  pdf: 'application/pdf',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
}

export function resolveMime(file: { name: string; type?: string }): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  return (ext && EXT_MIME_MAP[ext]) || 'application/octet-stream'
}

export type RenderableKind = 'image' | 'video' | 'audio'

export function isRenderable(mime: string): RenderableKind | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return null
}
