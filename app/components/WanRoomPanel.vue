<script setup lang="ts">
import { Copy, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const room = useRoomStore()
const signaling = useSignalingStore()
const identity = useIdentityStore()

const joinInput = ref('')
const copyHint = ref<string | null>(null)

const joinValid = computed(() => /^\d{4}$/.test(joinInput.value))

// 我创建的房间内除自己外已加入设备数
const myRoomGuests = computed(() => {
  if (!room.myPairing) return 0
  return room.myPairing.members.filter(m => m.clientId !== identity.clientId).length
})

function create() {
  signaling.createPairingRoom()
}

function join() {
  if (!joinValid.value) return
  signaling.joinPairingRoom(joinInput.value)
  joinInput.value = ''
}

function leaveJoined() {
  if (room.joinedPairing) signaling.leavePairingRoom(room.joinedPairing.roomId)
}

function leaveMine() {
  if (room.myPairing) signaling.leavePairingRoom(room.myPairing.roomId)
}

async function copyCode() {
  const code = room.myPairing?.code
  if (!code) return
  try {
    const { origin, pathname } = window.location
    const url = `${origin}${pathname}?join=${code}`
    await navigator.clipboard.writeText(url)
    copyHint.value = '链接已复制'
    setTimeout(() => (copyHint.value = null), 1200)
  }
  catch {
    copyHint.value = '复制失败'
  }
}

watch(
  () => signaling.lastError,
  (err) => {
    if (err === 'invalid-code' || err === 'not-found') {
      // 让用户在 join 输入下方看到错误
    }
  },
)
</script>

<template>
  <div class="space-y-3">
    <!-- 我创建的房间 -->
    <div v-if="room.myPairing" class="rounded-lg border bg-card p-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="text-xs text-muted-foreground">我的配对码</div>
          <div class="font-mono text-2xl tracking-widest">{{ room.myPairing.code }}</div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon" title="复制配对码" @click="copyCode">
            <Copy class="h-4 w-4" />
          </Button>
          <!-- 没人加入：直接关；有别人：弹确认避免误操作把对方踢掉 -->
          <Button v-if="myRoomGuests === 0" variant="ghost" size="icon" title="关闭房间" @click="leaveMine">
            <X class="h-4 w-4" />
          </Button>
          <AlertDialog v-else>
            <AlertDialogTrigger as-child>
              <Button variant="ghost" size="icon" title="关闭房间">
                <X class="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>关闭配对房间？</AlertDialogTitle>
                <AlertDialogDescription>
                  房间内还有 {{ myRoomGuests }} 台已加入设备，关闭后他们会被踢出，且配对码失效。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction @click="leaveMine">确认关闭</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div v-if="copyHint" class="mt-1 text-xs text-emerald-600">{{ copyHint }}</div>
    </div>
    <Button v-else variant="outline" class="w-full" @click="create">
      创建房间（生成 4 位码）
    </Button>

    <!-- 加入房间 -->
    <div v-if="room.joinedPairing" class="rounded-lg border bg-card p-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="text-xs text-muted-foreground">已加入</div>
          <div class="font-mono text-2xl tracking-widest">{{ room.joinedPairing.code || '—' }}</div>
        </div>
        <Button variant="ghost" size="icon" @click="leaveJoined">
          <X class="h-4 w-4" />
        </Button>
      </div>
    </div>
    <form v-else class="flex gap-2" @submit.prevent="join">
      <Input
        v-model="joinInput"
        placeholder="输入 4 位配对码"
        inputmode="numeric"
        maxlength="4"
        pattern="\d{4}"
      />
      <Button type="submit" :disabled="!joinValid">加入</Button>
    </form>

    <p
      v-if="signaling.lastError === 'not-found'"
      class="text-xs text-red-600"
    >
      房间不存在或已关闭
    </p>
    <p
      v-else-if="signaling.lastError === 'invalid-code'"
      class="text-xs text-red-600"
    >
      请输入 4 位数字
    </p>
    <p
      v-else-if="signaling.lastError === 'pool-exhausted'"
      class="text-xs text-red-600"
    >
      服务器繁忙，请稍后再试
    </p>
  </div>
</template>
