import { NavLink } from 'react-router'
import { abilities, autoReplyPlatforms } from '@/abilities'
import { useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useCurrentAutoPopUp } from '@/hooks/useAutoPopUp'
import { useAutoReply } from '@/hooks/useAutoReply'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { useUpdateStore } from '@/hooks/useUpdate'
import { cn } from '@/lib/utils'
import {
  CarbonBlockStorage,
  CarbonChat,
  CarbonContentDeliveryNetwork,
  CarbonGift,
  CarbonIbmEventAutomation,
  CarbonIbmWatsonTextToSpeech,
  CarbonSettings,
} from '../icons/carbon'

interface SidebarTab {
  id: string
  name: string
  isRunning?: boolean
  icon: React.ReactNode
  platform?: LiveControlPlatform[]
  showBadge?: boolean // 🟢 新增：是否显示小红点标记
}

export default function Sidebar() {
  const isAutoMessageRunning = useCurrentAutoMessage(context => context.isRunning)
  const isAutoPopupRunning = useCurrentAutoPopUp(context => context.isRunning)
  const { isRunning: isAutoReplyRunning } = useAutoReply()
  const platform = useCurrentLiveControl(context => context.platform)
  
  // 🟢 引入是否含有新版本的状态
  const hasUpdate = useUpdateStore.use.hasUpdate()

  const tabs: SidebarTab[] = [
    {
      id: '/',
      name: '打开中控台',
      icon: <CarbonContentDeliveryNetwork className="w-5 h-5" />,
    },
    {
      id: '/data-center',
      name: '数据中心',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/></svg>,
    },
    {
      id: '/auto-message',
      name: '自动发言',
      isRunning: isAutoMessageRunning,
      icon: <CarbonChat className="w-5 h-5" />,
    },
    {
      id: '/auto-popup',
      name: '自动弹窗',
      isRunning: isAutoPopupRunning,
      icon: <CarbonBlockStorage className="w-5 h-5" />,
    },
    {
      id: '/auto-reply',
      name: '自动回复',
      isRunning: isAutoReplyRunning,
      icon: <CarbonIbmEventAutomation className="w-5 h-5" />,
      platform: autoReplyPlatforms,
    },
    {
      id: '/red-packet',
      name: '一键发红包',
      icon: <CarbonGift className="w-5 h-5" />,
      platform: ['douyin', 'buyin'],
    },
    {
      id: '/ai-chat',
      name: 'AI 助手',
      icon: <CarbonIbmWatsonTextToSpeech className="w-5 h-5" />,
    },
    {
      id: '/system-logs',
      name: '运行日志',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      ),
    },
    {
      id: '/settings',
      name: '应用设置',
      icon: <CarbonSettings className="w-5 h-5" />,
      showBadge: hasUpdate, // 🟢 如果有更新，给设置项打上红点标记
    },
  ]

  const filteredTabs = tabs.filter(tab => {
    if (tab.platform) {
      return tab.platform.includes(platform)
    }
    return true
  })

  return (
    <aside className="w-64 min-w-[256px] bg-background border-r">
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-6">功能列表</h2>
        <nav className="space-y-2">
          {filteredTabs.map(tab => (
            <NavLink
              key={tab.id}
              to={tab.id}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all relative',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <div className="relative">
                {tab.icon}
                {/* 🟢 渲染红点标记 */}
                {tab.showBadge && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse" />
                )}
              </div>
              {tab.name}
              
              {/* 🟢 原有的正在运行绿点标记 */}
              {tab.isRunning && (
                <span className="absolute right-3 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}