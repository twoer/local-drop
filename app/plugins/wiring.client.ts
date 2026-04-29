// Client-only：启动时初始化 identity / mode / lanOptOut，并加载消息历史
// 不主动 start signaling —— 等用户在入口页选完模式后再连

export default defineNuxtPlugin(() => {
  const identity = useIdentityStore()
  const mode = useModeStore()
  const lanOptOut = useLanOptOutStore()
  const messages = useMessagesStore()

  identity.init()
  mode.init()
  lanOptOut.load()
  void messages.load()
})
