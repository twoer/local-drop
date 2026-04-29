import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-04-01',

  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    'shadcn-nuxt',
    '@vite-pwa/nuxt',
  ],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [
      tailwindcss(),
    ],
  },

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'LocalDrop',
      short_name: 'LocalDrop',
      description: '浏览器多设备 P2P 文件互传，零安装零账号',
      lang: 'zh-CN',
      theme_color: '#10b981',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait-primary',
      icons: [
        {
          src: 'favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
      // /api/* 始终走网络（信令 + 配置端点不能 cache）
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.includes('/api/'),
          handler: 'NetworkOnly',
        },
      ],
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      // dev 模式不启用 SW，避免与 HMR 冲突；生产 build 自动注入
      enabled: false,
      type: 'module',
    },
  },

  devtools: {
    enabled: true,
  },

  devServer: {
    port: 3010,
  },

  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/',
    head: {
      title: 'LocalDrop',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: 'favicon.svg' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '同局域网设备秒互传，跨网配对码加入，文件走 P2P 直连不经服务器。' },
      ],
    },
  },
})
