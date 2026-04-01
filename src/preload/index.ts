import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  openDirectoryDialog: () => Promise<string | null>
  saveFileDialog: (defaultPath: string) => Promise<string | null>
  openPack: (dirPath: string) => Promise<any>
  readDirectory: (dirPath: string) => Promise<any[]>
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  fileStat: (filePath: string) => Promise<{ size: number; mtime: number } | null>
  generateTemplate: (type: string, params: any) => Promise<string>
  startWatch: (dirPath: string) => Promise<void>
  stopWatch: () => Promise<void>
  onWatchChange: (callback: (data: { eventType: string; path: string }) => void) => () => void

  createFile: (filePath: string, content?: string) => Promise<void>
  createDirectory: (dirPath: string) => Promise<void>
  deleteFile: (filePath: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  copyFile: (src: string, dest: string) => Promise<void>
  moveFile: (src: string, dest: string) => Promise<void>
  pathExists: (p: string) => Promise<boolean>
  isDirectory: (p: string) => Promise<boolean>
  pathBasename: (p: string) => Promise<string>
  pathDirname: (p: string) => Promise<string>
  pathJoin: (...segments: string[]) => Promise<string>
}

const api: ElectronAPI = {
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveFileDialog: (defaultPath: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  openPack: (dirPath: string) => ipcRenderer.invoke('pack:open', dirPath),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  fileStat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
  generateTemplate: (type: string, params: any) => ipcRenderer.invoke('template:generate', type, params),
  startWatch: (dirPath: string) => ipcRenderer.invoke('watch:start', dirPath),
  stopWatch: () => ipcRenderer.invoke('watch:stop'),
  onWatchChange: (callback) => {
    const handler = (_: any, data: { eventType: string; path: string }) => callback(data)
    ipcRenderer.on('watch:change', handler)
    return () => ipcRenderer.removeListener('watch:change', handler)
  },

  createFile: (filePath: string, content: string = '') => ipcRenderer.invoke('fs:createFile', filePath, content),
  createDirectory: (dirPath: string) => ipcRenderer.invoke('fs:createDirectory', dirPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('fs:delete', filePath),
  rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  copyFile: (src: string, dest: string) => ipcRenderer.invoke('fs:copy', src, dest),
  moveFile: (src: string, dest: string) => ipcRenderer.invoke('fs:move', src, dest),
  pathExists: (p: string) => ipcRenderer.invoke('fs:exists', p),
  isDirectory: (p: string) => ipcRenderer.invoke('fs:isDirectory', p),
  pathBasename: (p: string) => ipcRenderer.invoke('fs:basename', p),
  pathDirname: (p: string) => ipcRenderer.invoke('fs:dirname', p),
  pathJoin: (...segments: string[]) => ipcRenderer.invoke('fs:join', ...segments),
}

contextBridge.exposeInMainWorld('electronAPI', api)
