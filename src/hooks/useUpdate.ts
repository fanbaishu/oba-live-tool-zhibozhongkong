import { useCallback, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSelectors } from '@/utils/zustand'
import { useIpcListener } from './useIpc'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'preparing'
  | 'downloading'
  | 'ready'
  | 'error'

export interface VersionState {
  currentVersion: string
  latestVersion: string
  releaseNote?: string
}

interface UpdateState {
  status: UpdateStatus
  versionInfo: VersionState | null
  progress: number
  error: ErrorType | null
  source: string
  hasUpdate: boolean // 🟢 新增：是否有更新的标识
}

interface UpdateAction {
  checkUpdateManually: () => Promise<{ upToDate: boolean } | undefined>
  startDownload: (source: string) => void
  installUpdate: () => void
  setProgress: (progress: number) => void
  setStatus: (status: UpdateStatus) => void
  setHasUpdate: (hasUpdate: boolean) => void // 🟢 新增：修改标识的方法
  reset: () => void
  handleError: (error: ErrorType) => void
  handleUpdate: (info: VersionState) => void
  setSource: (source: string) => void
}

type UpdateStore = UpdateState & UpdateAction

const useUpdateStoreBase = create<UpdateStore>()((set, get) => ({
  status: 'idle',
  versionInfo: null,
  progress: 0,
  error: null,
  source: 'github',
  hasUpdate: false, // 🟢 默认没有更新

  checkUpdateManually: async () => {
    set({ status: 'checking', error: null })
    try {
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.updater.checkUpdate)
      if (result) {
        // 🟢 触发更新时，自动标记 hasUpdate 为 true
        set({ status: 'available', versionInfo: result, hasUpdate: true })
      } else {
        set({ status: 'idle', hasUpdate: false })
        return { upToDate: true }
      }
    } catch (e) {
      set({ status: 'error', error: { message: (e as Error).message || '检查更新失败' } })
    }
  },
  startDownload: (source: string) => {
    set({ status: 'preparing' })
    window.ipcRenderer.invoke(IPC_CHANNELS.updater.startDownload, source)
  },
  installUpdate: () => {
    set({ status: 'ready' })
    window.ipcRenderer.invoke(IPC_CHANNELS.updater.quitAndInstall)
  },
  setStatus: (status: UpdateStatus) => set({ status }),
  setProgress: (progress: number) => set({ progress }),
  setHasUpdate: (hasUpdate: boolean) => set({ hasUpdate }), // 🟢 实现方法
  
  // 🟢 只重置进度和错误，保留新版本信息和红点标识！
reset: () => set({ status: 'idle', progress: 0, error: null }),
  
  handleError: (error: ErrorType) => {
    if (get().status === 'preparing' || get().status === 'downloading') {
      set({ status: 'error', error })
    }
  },
  handleUpdate: (info: VersionState) => {
    if (get().status === 'idle') {
      // 🟢 监听到更新时，自动标记 hasUpdate 为 true
      set({ status: 'available', versionInfo: info, hasUpdate: true })
    }
  },
  setSource: (source: string) => set({ source }),
}))

export const useUpdateStore = createSelectors(useUpdateStoreBase)

interface UpdateConfigStore {
  enableAutoCheckUpdate: boolean
  source: string
  customSource: string
  setEnableAutoCheckUpdate: (enabled: boolean) => void
  setSource: (source: string) => void
  setCustomSource: (customSource: string) => void
}

export const useUpdateConfigStore = create<UpdateConfigStore>()(
  persist(
    set => ({
      enableAutoCheckUpdate: true,
      source: 'github',
      customSource: '',
      setEnableAutoCheckUpdate: enabled => set({ enableAutoCheckUpdate: enabled }),
      setSource: source => set({ source }),
      setCustomSource: customSource => set({ customSource }),
    }),
    {
      name: 'update-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)