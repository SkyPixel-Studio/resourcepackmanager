import { ipcMain, dialog, BrowserWindow } from 'electron'
import {
  readDirectory, readFileContent, writeFileContent, getFileStats,
  createFile, createDirectory, deleteFile, renameFile, copyFile, moveFile,
  pathExists, isDirectory
} from './fileOps'
import { parseResourcePack, type PackInfo } from './packParser'
import { generateTemplate, type TemplateType, type TemplateParams } from './template'
import { watch, type FSWatcher } from 'chokidar'
import * as path from 'path'

let currentWatcher: FSWatcher | null = null

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择资源包目录'
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_, defaultPath: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [
        { name: 'Properties', extensions: ['properties'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled) return null
    return result.filePath
  })

  ipcMain.handle('pack:open', async (_, dirPath: string): Promise<PackInfo | null> => {
    return parseResourcePack(dirPath)
  })

  ipcMain.handle('fs:readDirectory', async (_, dirPath: string) => {
    return readDirectory(dirPath)
  })

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    return readFileContent(filePath)
  })

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    return writeFileContent(filePath, content)
  })

  ipcMain.handle('fs:stat', async (_, filePath: string) => {
    return getFileStats(filePath)
  })

  ipcMain.handle('template:generate', async (_, type: TemplateType, params: TemplateParams) => {
    return generateTemplate(type, params)
  })

  ipcMain.handle('watch:start', async (event, dirPath: string) => {
    if (currentWatcher) {
      await currentWatcher.close()
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    currentWatcher = watch(dirPath, {
      ignoreInitial: true,
      ignored: /(^|[\/\\])\../,
      persistent: true
    })

    currentWatcher.on('all', (eventType, path) => {
      if (!win.isDestroyed()) {
        win.webContents.send('watch:change', { eventType, path })
      }
    })
  })

  ipcMain.handle('watch:stop', async () => {
    if (currentWatcher) {
      await currentWatcher.close()
      currentWatcher = null
    }
  })

  // ---- File management ----

  ipcMain.handle('fs:createFile', async (_, filePath: string, content: string) => {
    await createFile(filePath, content)
  })

  ipcMain.handle('fs:createDirectory', async (_, dirPath: string) => {
    await createDirectory(dirPath)
  })

  ipcMain.handle('fs:delete', async (_, filePath: string) => {
    await deleteFile(filePath)
  })

  ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
    await renameFile(oldPath, newPath)
  })

  ipcMain.handle('fs:copy', async (_, src: string, dest: string) => {
    await copyFile(src, dest)
  })

  ipcMain.handle('fs:move', async (_, src: string, dest: string) => {
    await moveFile(src, dest)
  })

  ipcMain.handle('fs:exists', async (_, p: string) => {
    return pathExists(p)
  })

  ipcMain.handle('fs:isDirectory', async (_, p: string) => {
    return isDirectory(p)
  })

  ipcMain.handle('fs:basename', async (_, p: string) => {
    return path.basename(p)
  })

  ipcMain.handle('fs:dirname', async (_, p: string) => {
    return path.dirname(p)
  })

  ipcMain.handle('fs:join', async (_, ...segments: string[]) => {
    return path.join(...segments)
  })
}
