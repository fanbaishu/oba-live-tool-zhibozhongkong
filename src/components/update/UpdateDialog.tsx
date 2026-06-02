import { useMemoizedFn } from 'ahooks'
import { Download, RefreshCw, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { HtmlRenderer } from '@/components/common/HtmlRenderer'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIpcListener } from '@/hooks/useIpc'
import { useUpdateStore } from '@/hooks/useUpdate'

export function UpdateDialog() {
  const status = useUpdateStore.use.status()
  const setStatus = useUpdateStore.use.setStatus()
  const progress = useUpdateStore.use.progress()
  const setProgress = useUpdateStore.use.setProgress()
  const updateInfo = useUpdateStore.use.versionInfo()
  const startDownload = useUpdateStore.use.startDownload()
  const reset = useUpdateStore.use.reset()
  const error = useUpdateStore.use.error()
  const handleError = useUpdateStore.use.handleError()
  
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (status !== 'idle' && status !== 'checking') {
      setDialogOpen(true)
    }
  }, [status])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDialogOpen(false)
      setTimeout(() => reset(), 300)
    }
  }

  const quitAndInstall = async () => {
    await window.ipcRenderer.invoke(IPC_CHANNELS.updater.quitAndInstall)
  }

  const handleStartDownload = useMemoizedFn(() => {
    // 塞入你的网址，满足 TypeScript 的参数要求
    startDownload('https://rjgx.fbswlkj.com/') 
  })

  useIpcListener(IPC_CHANNELS.updater.downloadProgress, info => {
    setStatus('downloading')
    setProgress(info.percent)
  })

  useIpcListener(IPC_CHANNELS.updater.updateDownloaded, () => {
    setStatus('ready')
    setProgress(100)
  })

  useIpcListener(IPC_CHANNELS.updater.updateError, handleError)

  const openDownloadURL = (downloadUrl: string) => {
    window.open(downloadUrl, '_blank')
  }

  const renderActionButtons = useMemoizedFn(() => {
    if (status === 'downloading' || status === 'preparing') {
      return (
        <Button disabled variant="default">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          正在下载更新...
        </Button>
      )
    }
    if (status === 'ready') {
      return (
        <Button onClick={quitAndInstall} variant="default">
          <Rocket className="mr-2 h-4 w-4" />
          马上安装
        </Button>
      )
    }
    if (status === 'error' && error?.downloadURL) {
      return (
        <Button onClick={() => openDownloadURL(error.downloadURL!)} variant="default">
          <Download className="mr-2 h-4 w-4" />
          手动下载
        </Button>
      )
    }
    return (
      <Button onClick={handleStartDownload} variant="default">
        <Download className="mr-2 h-4 w-4" />
        立即更新
      </Button>
    )
  })

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogTitle className="text-xl">有新版本可用</DialogTitle>
        <DialogDescription>我们发现了一个新版本，更新以体验最新功能。</DialogDescription>

        {status !== 'error' && (
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex justify-between items-center bg-secondary/50 p-3 rounded-lg">
              <span className="text-sm text-muted-foreground">当前版本</span>
              <span className="font-mono font-bold">v{updateInfo?.currentVersion}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono font-bold text-primary">v{updateInfo?.latestVersion}</span>
            </div>
            
            {updateInfo?.releaseNote && (
              <div className="border rounded-md p-4 bg-muted/20">
                <p className="text-sm font-semibold mb-2">更新内容：</p>
                <ScrollArea className="max-h-48">
                  <HtmlRenderer className="markdown-body text-sm" html={updateInfo.releaseNote} />
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {/* 出错信息 */}
        {status === 'error' && error?.message && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            <p className="font-bold mb-1">更新出错</p>
            {error.message}
          </div>
        )}

        {/* 进度条 */}
        {(status === 'downloading' || status === 'ready' || status === 'preparing') && (
          <div className="space-y-2 mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {status === 'preparing' ? '正在准备...' : '下载中'}
              </span>
              <span className="font-bold">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          {renderActionButtons()}
        </div>
      </DialogContent>
    </Dialog>
  )
}