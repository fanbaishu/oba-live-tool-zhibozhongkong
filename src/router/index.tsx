import { createHashRouter } from 'react-router'
import AIChat from '@/pages/AIChat'
import AutoMessage from '@/pages/AutoMessage'
import AutoPopUp from '@/pages/AutoPopUp'
import AutoReply from '@/pages/AutoReply'
import AutoReplySettings from '@/pages/AutoReply/AutoReplySettings'
import LiveControl from '@/pages/LiveControl'
import RedPacket from '@/pages/RedPacket'
import Settings from '@/pages/SettingsPage'
import DataCenter from '@/pages/DataCenter' // 🟢 数据大屏
import SystemLogs from '@/pages/SystemLogs' // 🟢 运行日志
import App from '../App'

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true, 
        element: <LiveControl />,
      },
      {
        path: 'data-center', 
        element: <DataCenter />,
      },
      {
        path: 'system-logs', // 🟢 运行日志路由已经加在这里了！
        element: <SystemLogs />,
      },
      {
        path: 'auto-message',
        element: <AutoMessage />,
      },
      {
        path: 'auto-popup',
        element: <AutoPopUp />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'ai-chat',
        element: <AIChat />,
      },
      {
        path: 'auto-reply',
        element: <AutoReply />,
      },
      {
        path: 'auto-reply/settings',
        element: <AutoReplySettings />,
      },
      {
        path: 'red-packet',
        element: <RedPacket />,
      },
    ],
  },
])