import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, platform } from 'node:os'
import path from 'node:path'
import { app, net, shell, BrowserWindow } from 'electron' // 🟢 新增了 BrowserWindow
import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { marked } from 'marked'
import semver from 'semver'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import * as yaml from 'yaml'
import windowManager from '#/windowManager'
import packageJson from '../../../package.json'
import { createLogger } from '../logger'
import { errorMessage, sleep } from '../utils'

type LatestYml = {
  version: string
  files: Array<{
    url: string
    sha512: string
    size: number
  }>
  path: string
  sha512: string
  releaseDate: string
}

const GITHUB_OWNER = 'qiutongxue'
const GITHUB_REPO = '番白薯直播助手'
const CDN_URL = 'https://fastly.jsdelivr.net/gh/'
const PRODUCT_NAME = packageJson.name

const logger = createLogger('update')

// marked 生成的 html 要在新页面打开链接
marked.use({
  renderer: {
    link: ({ href, title, text }) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`
    },
  },
})

function extractChanges(changelogContent: string, userVersion: string): string {
  const lines = changelogContent.split('\n')
  const result = []

  for (const line of lines) {
    const versionMatch = line.match(/^##\s+v?([0-9]+\.[0-9]+\.[0-9]+)/) // 匹配版本 "## vX.Y.Z" 或 "## X.Y.Z"

    if (versionMatch) {
      const versionInLog = versionMatch[1] // X.Y.Z
      // 遇到小于等于当前版本的就停止
      if (semver.lte(versionInLog, userVersion)) {
        break
      }
    }

    result.push(line)
  }

  // slice(1) 负责过滤开头的 # Changelog
  return result.slice(1).join('\n')
}

async function fetchWithRetry(url: string | URL, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = (await timeoutFetch(url)) as Response
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (e) {
      if (i === retries - 1) throw e
      await sleep(delay)
    }
  }
}

async function timeoutFetch(url: string | URL, timeout = 5000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await net.fetch(url.toString(), {
      signal: controller.signal,
      // 不加上 User-Agent 会访问超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    })
    clearTimeout(timeoutId)
    return response
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Fetch timeout')
    }
    throw err
  }
}

const releaseNotes: Record<string, string> = {}
let latestVersion: string | null = null

async function getLatestVersion() {
  try {
    // 改成直接读取你服务器上的 latest.yml 获取版本号
    const response = await net.fetch('https://rjgx.fbswlkj.com/latest.yml')
    const yamlContent = await response.text()
    const data = yaml.parse(yamlContent) as LatestYml
    latestVersion = data.version
    return latestVersion
  } catch (error) {
    logger.error('获取最新版本失败', error)
    return null
  }
}

async function fetchChangelog() {
  if (latestVersion && releaseNotes[latestVersion]) {
    return releaseNotes[latestVersion]
  }
  try {
    // 🟢 重点：不要去 GitHub 找了，直接去你的宝塔服务器拉取 CHANGELOG.md
    const changelogURL = 'https://rjgx.fbswlkj.com/CHANGELOG.md'
    const changelogContent = await fetchWithRetry(changelogURL).then(res => res?.text())
    
    if (changelogContent) {
      // 找到新版本到当前版本的所有更新日志
      const updateLog = extractChanges(changelogContent, app.getVersion())
      // markdown 转成 html
      const releaseNote = await marked.parse(updateLog)
      if (latestVersion) {
        releaseNotes[latestVersion] = releaseNote
      }
      return releaseNote
    }
  } catch (error) {
    logger.error('获取更新日志失败', error)
    return undefined
  }
}

function getAssetsURL() {
  return 'https://rjgx.fbswlkj.com/' 
}

interface Updater {
  checkForUpdates(source: string): Promise<void>
  downloadUpdate(): void
  quitAndInstall(): void
}

class UpdateManager {
  constructor(private updater: Updater) {}

  public async checkForUpdates(source = 'github') {
    await this.updater.checkForUpdates(source)
  }

  public async checkUpdateVersion() {
    const latestVersion = await getLatestVersion()
    if (!latestVersion) {
      return
    }
    const currentVersion = app.getVersion()
    if (semver.lt(currentVersion, latestVersion)) {
      // 先用 log 提示更新
      logger.info(
        `检查到可用更新：${currentVersion} -> ${latestVersion}，可前往应用设置-软件更新处（刷新后）手动更新`,
      )
      const releaseNote = await fetchChangelog()

      return {
        currentVersion,
        latestVersion,
        releaseNote,
      }
    }
  }

  public async silentCheckForUpdate() {
    try {
      const result = await this.checkUpdateVersion()
      if (result) {
        windowManager.send(IPC_CHANNELS.app.notifyUpdate, { ...result })
      }
    } catch (err) {
      logger.debug(`静默检查更新失败：${err}`)
    }
  }

  public startDownload() {
    logger.info('开始下载更新……')
    this.updater.downloadUpdate()
  }

  public async quitAndInstall() {
    logger.info('准备退出并安装更新')
    this.updater.quitAndInstall()
  }
}

class WindowsUpdater implements Updater {
  private autoUpdater: AppUpdater
  constructor() {
    const { autoUpdater }: { autoUpdater: AppUpdater } = createRequire(import.meta.url)(
      'electron-updater',
    )
    this.autoUpdater = autoUpdater
    this.configureUpdater()
    this.registerEventListener()
  }

  private configureUpdater() {
    this.autoUpdater.forceDevUpdateConfig = true
    this.autoUpdater.disableWebInstaller = false
    this.autoUpdater.allowDowngrade = false
  }

  private registerEventListener() {
    this.autoUpdater.on('checking-for-update', () => {
      logger.debug('检查更新流程已启动...')
    })

    this.autoUpdater.on('update-available', async (info: UpdateInfo) => {
      logger.info(`有可用更新！当前版本：${app.getVersion()}，新版本：${info.version}`)

      const releaseNote = await fetchChangelog()
      windowManager.send(IPC_CHANNELS.updater.updateAvailable, {
        update: true,
        version: app.getVersion(),
        newVersion: info.version,
        releaseNote,
      })
    })

    this.autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      logger.info(`无可用更新。当前版本：${app.getVersion()}，新版本：${info.version}`)
      windowManager.send(IPC_CHANNELS.updater.updateAvailable, {
        update: false,
        version: app.getVersion(),
        newVersion: info.version,
      })
    })

    this.autoUpdater.on('download-progress', (progressInfo: ProgressInfo) => {
      windowManager.send(IPC_CHANNELS.updater.downloadProgress, progressInfo)
    })

    this.autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
      logger.info(`${event.version} 更新下载完成!`)
      windowManager.send(IPC_CHANNELS.updater.updateDownloaded, event)
    })

    this.autoUpdater.on('error', (error: Error) => {
      logger.error('更新出错: ', error.message)
      windowManager.send(IPC_CHANNELS.updater.updateError, {
        message: error.message,
        error,
      })
    })
  }

  private async checkUpdateForGithub() {
    // 彻底废弃 GitHub 逻辑，强制指向你的域名
    this.autoUpdater.requestHeaders = null
    this.autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://rjgx.fbswlkj.com/', 
    })
    return this.autoUpdater.checkForUpdates()
  }

  private async checkUpdateForGhProxy(source: string) {
    // 强制使用你自己的域名，无视 source 参数传入的乱七八糟的地址
    const targetURL = 'https://rjgx.fbswlkj.com/'
    
    this.autoUpdater.setFeedURL({
      provider: 'generic',
      url: targetURL, 
    })
    
    try {
      return await this.autoUpdater.checkForUpdates()
    } catch (error) {
      // 保持报错日志，但下载地址强制指定为你服务器上的文件
      const message = `网络错误: ${errorMessage(error).split('\n')[0]}`
      const downloadURL = `${targetURL}${PRODUCT_NAME}_${latestVersion}_windows_x64.exe`
      windowManager.send(IPC_CHANNELS.updater.updateError, { message, downloadURL })
    }
  }

  public async checkForUpdates(source: string) {
    this.autoUpdater.requestHeaders = { authorization: '' }
    try {
      if (!app.isPackaged) {
        if (!this.autoUpdater.forceDevUpdateConfig) {
          const message = '更新功能仅在应用打包后可用。'
          windowManager.send(IPC_CHANNELS.updater.updateError, { message })
          return
        }
      }
      logger.debug(`检查更新中…… (更新源: ${source})`)

      if (source === 'github') {
        await this.checkUpdateForGithub()
      } else {
        await this.checkUpdateForGhProxy(source)
      }
    } catch (error) {
      const message = `检查更新时发生错误: ${errorMessage(error)}`
      logger.error(message)
      windowManager.send(IPC_CHANNELS.updater.updateError, { message })
    }
  }

  public async downloadUpdate() {
    this.autoUpdater.downloadUpdate()
  }

  public async quitAndInstall() {
    logger.info('准备强制退出并安装更新')
    
    // 🟢 暴力卸载逻辑：移除所有可能阻止软件退出的监听器，并销毁所有活动窗口
    app.removeAllListeners('window-all-closed')
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      win.removeAllListeners('close')
      win.destroy()
    })

    // 呼叫更新程序进行覆盖安装
    this.autoUpdater.quitAndInstall(false, true)
  }
}

class MacOSUpdater implements Updater {
  private versionInfo: LatestYml | null = null
  private assetsURL: string | null = null
  private savePath: string | null = null
  private safeSource = ''
  
  public async checkForUpdates(source: string) {
    try {
      const assetsURL = getAssetsURL()
      this.safeSource = source === 'github' ? '' : new URL(source).href
      this.assetsURL = assetsURL
      const latestYmlURL = `${this.safeSource}${new URL('latest-mac.yml', this.assetsURL)}`
      const ymlContent = (await net.fetch(latestYmlURL).then(res => res.text())) as string
      const latestYml = yaml.parse(ymlContent) as LatestYml

      if (!latestYml) {
        const message = '获取文件更新信息失败'
        throw new Error(message)
      }
      this.versionInfo = latestYml
      if (semver.lt(latestYml.version, app.getVersion())) {
        logger.info(`${app.getVersion()} 已经是最新版本，无需更新`)
        return
      }
    } catch (err) {
      const message = errorMessage(err)
      logger.error(message)
      windowManager.send(IPC_CHANNELS.updater.updateError, { message: message })
      return
    }
    this.downloadUpdate()
  }

  public async downloadUpdate() {
    let fileUrl: string | undefined
    try {
      const setupFile = this.versionInfo?.files.find(file => file.url.endsWith(`${arch()}.dmg`))
      if (!setupFile) {
        const message = '找不到 dmg 文件'
        throw new Error(message)
      }
      this.savePath = path.join(app.getPath('downloads'), 'oba-update-setup.dmg')
      if (existsSync(this.savePath)) {
        const localFileSha512 = await this.calculateFileHash(this.savePath)
        logger.debug(`检测到本地文件，计算 Sha512 哈希值为 ${localFileSha512}`)
        if (localFileSha512 === setupFile.sha512) {
          logger.debug('本地已存在安装包，无需重复下载')
          windowManager.send(IPC_CHANNELS.updater.updateDownloaded)
          return
        }
      }
      // biome-ignore lint/style/noNonNullAssertion: 确保 assetsURL 不为 null
      fileUrl = `${this.safeSource}${new URL(setupFile.url, this.assetsURL!)}`
      const resp = await net.fetch(fileUrl)
      if (!resp.ok) {
        const message = `网络错误: ${resp.statusText}`
        throw new Error(message)
      }

      const totalBytes = Number.parseInt(resp.headers.get('Content-Length') ?? '0', 10)
      logger.debug(`开始下载文件 ${fileUrl}，文件大小 ${totalBytes / 1024 / 1024} MB`)
      let downloadBytes = 0

      const reader = resp.body?.getReader()
      if (!reader) {
        const message = '获取文件流失败'
        throw new Error(message)
      }
      if (existsSync(this.savePath)) {
        unlinkSync(this.savePath)
      }
      const fileWriter = createWriteStream(this.savePath)

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        downloadBytes += value.length
        fileWriter.write(value)

        if (totalBytes > 0) {
          const progress = (downloadBytes / totalBytes) * 100
          windowManager.send(IPC_CHANNELS.updater.downloadProgress, {
            delta: totalBytes - downloadBytes,
            percent: progress,
            bytesPerSecond: 0,
            transferred: downloadBytes,
            total: totalBytes,
          })
        }
      }
      fileWriter.end()
      logger.debug(`文件 ${fileUrl} 下载完成，保存到 ${this.savePath}`)
      windowManager.send(IPC_CHANNELS.updater.updateDownloaded)
    } catch (err) {
      const message = `下载文件失败: ${errorMessage(err)}`
      logger.error(message)
      windowManager.send(IPC_CHANNELS.updater.updateError, { message, downloadURL: fileUrl })
    }
  }

  public async quitAndInstall() {
    if (!this.savePath) {
      const message = '未指定下载文件路径'
      throw new Error(message)
    }
    if (existsSync(this.savePath)) {
      await shell.openPath(this.savePath)
      await sleep(3000)
      app.quit()
    } else {
      logger.error(`下载文件 ${this.savePath} 不存在`)
    }
    return
  }

  private calculateFileHash(filePath: string) {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('sha512')
      const stream = createReadStream(filePath)

      stream.on('data', chunk => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('base64')))
      stream.on('error', reject)
    })
  }
}

export const updateManager = new UpdateManager(
  platform() === 'darwin' ? new MacOSUpdater() : new WindowsUpdater(),
)