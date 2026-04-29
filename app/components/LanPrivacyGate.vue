<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// CGNAT 隐私 opt-in：当前 LAN 房间出现陌生设备时（首次进入未确认过的 fingerprint），弹询问
// 用户可选「留在 LAN」（acknowledge）或「不在此网络」（optOut + leaveLan）

const room = useRoomStore()
const peers = usePeersStore()
const identity = useIdentityStore()
const lanOptOut = useLanOptOutStore()
const signaling = useSignalingStore()

const open = ref(false)

const lanFingerprint = computed(() => room.lan?.roomId ?? '')
const otherCount = computed(() => {
  if (!room.lan) return 0
  return room.lan.members.filter(m => m.clientId !== identity.clientId).length
})

watch(
  () => [lanFingerprint.value, otherCount.value] as const,
  ([fp, count]) => {
    if (!fp || count === 0) {
      open.value = false
      return
    }
    if (lanOptOut.isAcknowledged(fp)) return
    if (lanOptOut.isOptedOut(fp)) return
    open.value = true
  },
  { immediate: true },
)

function stay() {
  if (lanFingerprint.value) lanOptOut.acknowledge(lanFingerprint.value)
  open.value = false
}

function leave() {
  signaling.leaveLan()
  open.value = false
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>看到 {{ otherCount }} 台陌生设备</AlertDialogTitle>
        <AlertDialogDescription>
          它们和你共享同一个公网出口（家庭路由 / 办公室网络 / 运营商共享 IP）。
          <br><br>
          <strong>留在 LAN</strong>：互相可见，可直接传文件。家里 / 办公室常见。
          <br>
          <strong>不在这个网络</strong>：可能是运营商让多家共享了同一个 IP。
          点击后 7 天内不再自动加入此网络。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="leave">不在这个网络</AlertDialogCancel>
        <AlertDialogAction @click="stay">留在 LAN</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
