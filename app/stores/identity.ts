import { defineStore } from 'pinia'
import type { DeviceInfo } from '~~/shared/types/domain'

export const useIdentityStore = defineStore('identity', () => {
  const clientId = ref('')
  const device = ref<DeviceInfo | null>(null)

  function init() {
    clientId.value = getOrCreateClientId()
    const partial = parseSelfDevice(clientId.value)
    device.value = {
      ...partial,
      // 临时本地名；真名由 hello-ack.assignedName 回填
      name: `${partial.os} + ${partial.browser}`,
    }
  }

  function setAssignedName(name: string) {
    if (device.value) device.value.name = name
  }

  return { clientId, device, init, setAssignedName }
})
