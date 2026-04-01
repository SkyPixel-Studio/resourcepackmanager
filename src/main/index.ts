import { app, BrowserWindow, shell, protocol, net, nativeImage } from 'electron'
import { join, resolve } from 'path'
import { registerIpcHandlers } from './ipc'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'

let mainWindow: BrowserWindow | null = null

function resolveIcon(): string {
  // In dev: __dirname = <project>/out/main, project root = __dirname/../../
  // In prod: __dirname = <app>/out/main, build is at <app>/build/
  const candidates = [
    resolve(__dirname, '../../build/icon.png'),
    resolve(__dirname, '../../logo.png'),
    resolve(app.getAppPath(), 'build/icon.png'),
    resolve(app.getAppPath(), 'logo.png'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

function createWindow(): void {
  const iconPath = resolveIcon()
  const icon = nativeImage.createFromPath(iconPath)

  if (process.platform === 'darwin' && app.dock && !icon.isEmpty()) {
    app.dock.setIcon(icon)
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  protocol.handle('local-res', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-res://', ''))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
