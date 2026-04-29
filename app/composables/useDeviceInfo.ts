import Bowser from 'bowser'
import type { Browser, ClientId, DeviceInfo, Os } from '~~/shared/types/domain'

function mapOs(name?: string): Os {
  switch (name) {
    case 'macOS':
      return 'macOS'
    case 'Windows':
      return 'Windows'
    case 'iOS':
      return 'iOS'
    case 'Android':
      return 'Android'
    case 'Linux':
      return 'Linux'
    default:
      return 'Unknown'
  }
}

function mapBrowser(name?: string): Browser {
  switch (name) {
    case 'Chrome':
    case 'Chromium':
      return 'Chrome'
    case 'Microsoft Edge':
    case 'Edge':
      return 'Edge'
    case 'Safari':
      return 'Safari'
    case 'Firefox':
      return 'Firefox'
    default:
      return 'Unknown'
  }
}

// 只解析 UA → os + browser；name 由服务端去重后回传
export function parseSelfDevice(clientId: ClientId): Omit<DeviceInfo, 'name'> {
  if (typeof navigator === 'undefined') {
    return { clientId, os: 'Unknown', browser: 'Unknown' }
  }
  try {
    const b = Bowser.parse(navigator.userAgent)
    return {
      clientId,
      os: mapOs(b.os.name),
      browser: mapBrowser(b.browser.name),
    }
  }
  catch {
    return { clientId, os: 'Unknown', browser: 'Unknown' }
  }
}
