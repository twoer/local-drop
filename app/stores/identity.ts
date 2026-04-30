import { defineStore } from 'pinia'
import type { DeviceInfo } from '~~/shared/types/domain'

const STORAGE_KEY = 'localdrop:name'

export const useIdentityStore = defineStore('identity', () => {
  const clientId = ref('')
  const device = ref<DeviceInfo | null>(null)

  function init() {
    clientId.value = getOrCreateClientId()
    const partial = parseSelfDevice(clientId.value)
    device.value = {
      ...partial,
      name: getCustomName() ?? `${partial.os} + ${partial.browser}`,
    }
  }

  function setAssignedName(name: string) {
    if (device.value) device.value.name = name
  }

  function getCustomName(): string | null {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(STORAGE_KEY)
  }

  function setCustomName(name: string) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, name.trim())
  }

  return { clientId, device, init, setAssignedName, getCustomName, setCustomName }
})
