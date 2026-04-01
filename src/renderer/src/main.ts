import './styles/global.css'
import './styles/editor.css'

import { FileTreeComponent } from './components/fileTree'
import { FlatViewComponent } from './components/flatView'
import { EditorComponent } from './components/editor'
import { ImagePreviewComponent } from './components/imagePreview'
import { TemplateDialogComponent } from './components/templateDialog'
import { PathHelperComponent } from './components/pathHelper'
import { StatusBarComponent } from './components/statusBar'
import { createModelViewer, isMinecraftModel, type ModelViewerComponent } from './components/modelViewer'
import type { PackInfo, FileTreeNode, ResourceFile } from './utils/resourceTypes'
import { computeResourcePath } from './utils/pathResolver'

declare const electronAPI: {
  openDirectoryDialog: () => Promise<string | null>
  saveFileDialog: (defaultPath: string) => Promise<string | null>
  openPack: (dirPath: string) => Promise<PackInfo | null>
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  fileStat: (filePath: string) => Promise<{ size: number; mtime: number } | null>
  startWatch: (dirPath: string) => Promise<void>
  stopWatch: () => Promise<void>
  onWatchChange: (cb: (data: { eventType: string; path: string }) => void) => () => void

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

// ---- State ----
let packInfo: PackInfo | null = null
let unsubWatch: (() => void) | null = null

// Clipboard for cut/copy/paste
interface Clipboard {
  path: string
  mode: 'copy' | 'cut'
}
let clipboard: Clipboard | null = null
let activeModelViewer: ModelViewerComponent | null = null

// ---- Components ----
const statusBar = new StatusBarComponent()

const editor = new EditorComponent(
  document.getElementById('editor-container')!,
  document.getElementById('editor-tabs')!,
  document.getElementById('welcome-screen')!,
  {
    onSave: async (path, content) => {
      try {
        await electronAPI.writeFile(path, content)
        statusBar.setFilePath(path)
      } catch (e) {
        console.error('Save failed:', e)
      }
    },
    onModifiedChange: (_path, _modified) => {},
    onCursorChange: (line, col) => statusBar.setCursor(line, col),
    onMediaClear: () => disposeActiveModelViewer()
  }
)

const fileTree = new FileTreeComponent(
  document.getElementById('file-tree')!,
  {
    onFileOpen: (path) => openFile(path),
    onContextMenu: (e, node) => showContextMenu(e, node),
    onDrop: (srcPath, destDir) => handleFileDrop(srcPath, destDir)
  }
)

const flatView = new FlatViewComponent(
  document.getElementById('flat-list')!,
  document.getElementById('flat-search') as HTMLInputElement,
  document.querySelectorAll<HTMLElement>('.flat-tab'),
  {
    onFileOpen: (path) => openFile(path),
    onContextMenu: (e, file) => showFileContextMenu(e, file)
  }
)

const imagePreview = new ImagePreviewComponent(
  document.getElementById('image-preview')!,
  document.getElementById('file-info')!
)

const templateDialog = new TemplateDialogComponent()
const pathHelper = new PathHelperComponent()

// ---- File open ----
async function openFile(filePath: string): Promise<void> {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  const imageExts = ['.png', '.jpg', '.jpeg', '.tga', '.gif']
  const audioExts = ['.ogg', '.wav']

  if (imageExts.includes(ext)) {
    showImageInCenter(filePath)
    imagePreview.showImage(filePath)
    const stat = await electronAPI.fileStat(filePath)
    if (stat) imagePreview.showFileInfo(filePath, stat.size, ext)
    statusBar.setFilePath(filePath)
    return
  }

  if (audioExts.includes(ext)) {
    showAudioInCenter(filePath)
    imagePreview.clear()
    imagePreview.showAudio(filePath)
    const stat = await electronAPI.fileStat(filePath)
    if (stat) imagePreview.showFileInfo(filePath, stat.size, ext)
    statusBar.setFilePath(filePath)
    return
  }

  const textExts = [
    '.json', '.properties', '.mcmeta', '.txt', '.lang', '.cfg',
    '.fsh', '.vsh', '.journal', '.bbmodel'
  ]
  if (!textExts.includes(ext)) return

  try {
    const content = await electronAPI.readFile(filePath)

    if (ext === '.json' && packInfo) {
      try {
        const parsed = JSON.parse(content)
        if (isMinecraftModel(parsed) && (filePath.includes('/models/') || filePath.includes('\\models\\'))) {
          showModelInCenter(filePath, () => {
            disposeActiveModelViewer()
            editor.openFile(filePath, content)
          })
          statusBar.setFilePath(filePath)
          const stat = await electronAPI.fileStat(filePath)
          if (stat) imagePreview.showFileInfo(filePath, stat.size, ext)
          return
        }
      } catch {
        // Not valid JSON or not a model, fall through to text editor
      }
    }

    await editor.openFile(filePath, content)
    statusBar.setFilePath(filePath)

    const stat = await electronAPI.fileStat(filePath)
    if (stat) imagePreview.showFileInfo(filePath, stat.size, ext)

    if (ext === '.properties' && packInfo) {
      imagePreview.showPropertiesRefs(content, packInfo.rootPath)
    }
  } catch (e) {
    console.error('Failed to open file:', e)
  }
}

// ---- Show image in center editor area ----
function showImageInCenter(filePath: string): void {
  const container = document.getElementById('editor-container')!
  const welcome = document.getElementById('welcome-screen')!
  welcome.style.display = 'none'

  disposeActiveModelViewer()
  container.querySelectorAll('.media-viewer').forEach(el => el.remove())

  const viewer = document.createElement('div')
  viewer.className = 'media-viewer'

  const name = filePath.substring(filePath.lastIndexOf('/') + 1)

  const header = document.createElement('div')
  header.className = 'media-viewer-header'
  header.textContent = name

  const imgWrap = document.createElement('div')
  imgWrap.className = 'media-viewer-body'

  const img = document.createElement('img')
  img.src = `local-res://${filePath}`
  img.className = 'media-viewer-image'
  img.alt = name
  img.onerror = () => {
    imgWrap.innerHTML = '<div style="color:var(--text-muted);padding:40px">无法加载图片</div>'
  }

  imgWrap.appendChild(img)
  viewer.appendChild(header)
  viewer.appendChild(imgWrap)
  container.appendChild(viewer)
}

// ---- Show audio player in center editor area ----
function showAudioInCenter(filePath: string): void {
  const container = document.getElementById('editor-container')!
  const welcome = document.getElementById('welcome-screen')!
  welcome.style.display = 'none'

  disposeActiveModelViewer()
  container.querySelectorAll('.media-viewer').forEach(el => {
    const aud = el.querySelector('audio')
    if (aud) { aud.pause(); aud.src = '' }
    el.remove()
  })

  const viewer = document.createElement('div')
  viewer.className = 'media-viewer'

  const name = filePath.substring(filePath.lastIndexOf('/') + 1)

  const header = document.createElement('div')
  header.className = 'media-viewer-header'
  header.textContent = name

  const body = document.createElement('div')
  body.className = 'media-viewer-body media-viewer-audio'

  const icon = document.createElement('div')
  icon.style.cssText = 'font-size:64px;margin-bottom:16px'
  icon.textContent = '🔊'
  body.appendChild(icon)

  const audio = document.createElement('audio')
  audio.src = `local-res://${filePath}`
  audio.preload = 'metadata'

  const playBtn = document.createElement('button')
  playBtn.className = 'audio-center-play'
  playBtn.textContent = '▶ 播放'

  const timeEl = document.createElement('div')
  timeEl.className = 'audio-center-time'
  timeEl.textContent = '0:00 / 0:00'

  const progress = document.createElement('input')
  progress.type = 'range'
  progress.className = 'audio-center-progress'
  progress.min = '0'
  progress.max = '1000'
  progress.value = '0'

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play()
      playBtn.textContent = '⏸ 暂停'
    } else {
      audio.pause()
      playBtn.textContent = '▶ 播放'
    }
  })

  audio.addEventListener('loadedmetadata', () => {
    timeEl.textContent = `0:00 / ${fmtTime(audio.duration)}`
  })

  audio.addEventListener('timeupdate', () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 1000 : 0
    progress.value = String(Math.round(pct))
    timeEl.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`
  })

  audio.addEventListener('ended', () => {
    playBtn.textContent = '▶ 播放'
    progress.value = '0'
  })

  progress.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (parseFloat(progress.value) / 1000) * audio.duration
    }
  })

  body.appendChild(playBtn)
  body.appendChild(progress)
  body.appendChild(timeEl)
  body.appendChild(audio)

  viewer.appendChild(header)
  viewer.appendChild(body)
  container.appendChild(viewer)
}

function fmtTime(sec: number): string {
  if (!sec || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---- Dispose active model viewer ----
function disposeActiveModelViewer(): void {
  if (activeModelViewer) {
    activeModelViewer.dispose()
    activeModelViewer = null
  }
}

// ---- Show 3D model in center editor area ----
function showModelInCenter(filePath: string, onViewSource: () => void): void {
  const container = document.getElementById('editor-container')!
  const welcome = document.getElementById('welcome-screen')!
  welcome.style.display = 'none'

  // Remove any existing media viewers
  container.querySelectorAll('.media-viewer').forEach(el => {
    const aud = el.querySelector('audio')
    if (aud) { aud.pause(); aud.src = '' }
    el.remove()
  })

  disposeActiveModelViewer()

  if (!packInfo) return

  activeModelViewer = createModelViewer(container, filePath, packInfo.rootPath, onViewSource)
}

// ---- Pack open ----
async function openPack(dirPath: string): Promise<void> {
  if (unsubWatch) { unsubWatch(); unsubWatch = null }
  await electronAPI.stopWatch()

  packInfo = await electronAPI.openPack(dirPath)
  if (!packInfo) return

  document.getElementById('pack-title')!.textContent =
    `Resource Pack Manager — ${packInfo.rootPath.split('/').pop()}`

  statusBar.setPackRoot(packInfo.rootPath)
  statusBar.setPackInfo(packInfo.packFormat, packInfo.description)
  imagePreview.setPackRoot(packInfo.rootPath)
  pathHelper.setFiles(packInfo.files, packInfo.rootPath)

  fileTree.render(packInfo.fileTree)
  flatView.setFiles(packInfo.files)

  await electronAPI.startWatch(dirPath)
  unsubWatch = electronAPI.onWatchChange(async () => {
    const newPack = await electronAPI.openPack(dirPath)
    if (newPack) {
      packInfo = newPack
      fileTree.render(packInfo.fileTree)
      flatView.setFiles(packInfo.files)
      pathHelper.setFiles(packInfo.files, packInfo.rootPath)
    }
  })
}

// ---- Drag-and-drop: move file into directory ----
async function handleFileDrop(srcPath: string, destDir: string): Promise<void> {
  try {
    const basename = await electronAPI.pathBasename(srcPath)
    const destPath = await electronAPI.pathJoin(destDir, basename)

    if (srcPath === destPath) return
    if (await electronAPI.pathExists(destPath)) {
      if (!confirm(`目标位置已存在 "${basename}"，是否覆盖？`)) return
    }

    await electronAPI.moveFile(srcPath, destPath)
    await reloadPack()
  } catch (e) {
    console.error('Move failed:', e)
    alert(`移动失败: ${e}`)
  }
}

// ---- Inline rename ----
function startInlineRename(nodePath: string): void {
  const treeItem = document.querySelector(`.tree-item[data-path="${CSS.escape(nodePath)}"]`)
  if (!treeItem) return

  const nameEl = treeItem.querySelector('.tree-name') as HTMLElement
  if (!nameEl) return

  const currentName = nameEl.textContent || ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tree-rename-input'
  input.value = currentName

  const ext = currentName.includes('.') ? currentName.substring(currentName.lastIndexOf('.')) : ''
  const nameWithoutExt = ext ? currentName.substring(0, currentName.lastIndexOf('.')) : currentName

  nameEl.style.display = 'none'
  nameEl.parentElement!.appendChild(input)
  input.focus()
  input.setSelectionRange(0, nameWithoutExt.length)

  let committed = false

  const commit = async () => {
    if (committed) return
    committed = true
    const newName = input.value.trim()
    input.remove()
    nameEl.style.display = ''

    if (!newName || newName === currentName) return

    try {
      const dir = await electronAPI.pathDirname(nodePath)
      const newPath = await electronAPI.pathJoin(dir, newName)

      if (await electronAPI.pathExists(newPath)) {
        alert(`"${newName}" 已存在`)
        return
      }

      await electronAPI.rename(nodePath, newPath)
      await reloadPack()
    } catch (e) {
      console.error('Rename failed:', e)
      alert(`重命名失败: ${e}`)
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { committed = true; input.remove(); nameEl.style.display = '' }
    e.stopPropagation()
  })
  input.addEventListener('blur', commit)
}

// ---- Context menu helper ----
interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  separator?: boolean
  disabled?: boolean
}

function renderContextMenu(e: MouseEvent, items: MenuItem[]): void {
  const menu = document.getElementById('context-menu')!
  menu.innerHTML = ''
  menu.style.display = 'block'
  menu.style.left = `${e.clientX}px`
  menu.style.top = `${e.clientY}px`

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div')
      sep.className = 'context-menu-separator'
      menu.appendChild(sep)
      continue
    }

    const el = document.createElement('div')
    el.className = 'context-menu-item'
    if (item.disabled) el.classList.add('disabled')
    el.textContent = item.label
    if (item.shortcut) {
      const sc = document.createElement('span')
      sc.className = 'context-menu-shortcut'
      sc.textContent = item.shortcut
      el.appendChild(sc)
    }
    if (!item.disabled) {
      el.addEventListener('click', () => {
        menu.style.display = 'none'
        item.action()
      })
    }
    menu.appendChild(el)
  }

  // Clamp to viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`
    }
  })
}

// ---- Context menu: file tree ----
function showContextMenu(e: MouseEvent, node: FileTreeNode): void {
  const items: MenuItem[] = []

  if (!node.isDirectory) {
    items.push({ label: '打开', action: () => openFile(node.path), shortcut: 'Enter' })
  }

  if (packInfo && !node.isDirectory) {
    const rp = computeResourcePath(node.path, packInfo.rootPath)
    items.push({
      label: '复制资源路径',
      shortcut: rp,
      action: () => { navigator.clipboard.writeText(rp) }
    })
    items.push({
      label: '插入路径到编辑器',
      action: () => { editor.insertAtCursor(rp) }
    })
  }

  items.push({ label: '', action: () => {}, separator: true })

  // File management
  items.push({
    label: '新建文件',
    shortcut: '',
    action: async () => {
      const dir = node.isDirectory ? node.path : await electronAPI.pathDirname(node.path)
      const name = prompt('输入文件名:')
      if (!name) return
      try {
        const newPath = await electronAPI.pathJoin(dir, name)
        if (await electronAPI.pathExists(newPath)) { alert(`"${name}" 已存在`); return }
        await electronAPI.createFile(newPath, '')
        await reloadPack()
        openFile(newPath)
      } catch (err) { alert(`创建失败: ${err}`) }
    }
  })

  items.push({
    label: '新建文件夹',
    action: async () => {
      const dir = node.isDirectory ? node.path : await electronAPI.pathDirname(node.path)
      const name = prompt('输入文件夹名:')
      if (!name) return
      try {
        const newPath = await electronAPI.pathJoin(dir, name)
        if (await electronAPI.pathExists(newPath)) { alert(`"${name}" 已存在`); return }
        await electronAPI.createDirectory(newPath)
        await reloadPack()
      } catch (err) { alert(`创建失败: ${err}`) }
    }
  })

  items.push({ label: '', action: () => {}, separator: true })

  items.push({
    label: '复制',
    shortcut: '⌘C',
    action: () => { clipboard = { path: node.path, mode: 'copy' } }
  })

  items.push({
    label: '剪切',
    shortcut: '⌘X',
    action: () => { clipboard = { path: node.path, mode: 'cut' } }
  })

  items.push({
    label: '粘贴',
    shortcut: '⌘V',
    disabled: !clipboard,
    action: async () => {
      if (!clipboard) return
      try {
        const dir = node.isDirectory ? node.path : await electronAPI.pathDirname(node.path)
        const basename = await electronAPI.pathBasename(clipboard.path)
        let destPath = await electronAPI.pathJoin(dir, basename)

        // Auto-rename on conflict
        if (await electronAPI.pathExists(destPath)) {
          const ext = basename.includes('.') ? basename.substring(basename.lastIndexOf('.')) : ''
          const stem = ext ? basename.substring(0, basename.lastIndexOf('.')) : basename
          let i = 1
          do {
            destPath = await electronAPI.pathJoin(dir, `${stem}_${i}${ext}`)
            i++
          } while (await electronAPI.pathExists(destPath))
        }

        if (clipboard.mode === 'copy') {
          await electronAPI.copyFile(clipboard.path, destPath)
        } else {
          await electronAPI.moveFile(clipboard.path, destPath)
          clipboard = null
        }
        await reloadPack()
      } catch (err) { alert(`粘贴失败: ${err}`) }
    }
  })

  items.push({ label: '', action: () => {}, separator: true })

  items.push({
    label: '重命名',
    shortcut: 'F2',
    action: () => startInlineRename(node.path)
  })

  items.push({
    label: '删除',
    shortcut: 'Delete',
    action: async () => {
      const name = await electronAPI.pathBasename(node.path)
      if (!confirm(`确定要删除 "${name}" 吗？此操作不可撤销。`)) return
      try {
        await electronAPI.deleteFile(node.path)
        await reloadPack()
      } catch (err) { alert(`删除失败: ${err}`) }
    }
  })

  if (node.isDirectory && packInfo) {
    items.push({ label: '', action: () => {}, separator: true })
    items.push({
      label: '在此目录新建 CIT',
      action: () => {
        templateDialog.open(packInfo!, (filePath) => {
          openFile(filePath)
          reloadPack()
        })
      }
    })
  }

  renderContextMenu(e, items)
}

// ---- Context menu: flat view ----
function showFileContextMenu(e: MouseEvent, file: ResourceFile): void {
  const items: MenuItem[] = [
    { label: '打开', action: () => openFile(file.path) },
    {
      label: '复制资源路径',
      shortcut: file.resourcePath,
      action: () => { navigator.clipboard.writeText(file.resourcePath) }
    },
    {
      label: '插入路径到编辑器',
      action: () => { editor.insertAtCursor(file.resourcePath) }
    },
    { label: '', action: () => {}, separator: true },
    {
      label: '复制',
      shortcut: '⌘C',
      action: () => { clipboard = { path: file.path, mode: 'copy' } }
    },
    {
      label: '剪切',
      shortcut: '⌘X',
      action: () => { clipboard = { path: file.path, mode: 'cut' } }
    },
    { label: '', action: () => {}, separator: true },
    {
      label: '重命名',
      shortcut: 'F2',
      action: () => startInlineRename(file.path)
    },
    {
      label: '删除',
      action: async () => {
        if (!confirm(`确定要删除 "${file.name}" 吗？`)) return
        try {
          await electronAPI.deleteFile(file.path)
          await reloadPack()
        } catch (err) { alert(`删除失败: ${err}`) }
      }
    }
  ]

  renderContextMenu(e, items)
}

async function reloadPack(): Promise<void> {
  if (packInfo) await openPack(packInfo.rootPath)
}

// ---- Close context menu on click elsewhere ----
document.addEventListener('click', () => {
  document.getElementById('context-menu')!.style.display = 'none'
})

// ---- Panel tab switching ----
document.querySelectorAll<HTMLElement>('.panel-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'))
    const target = btn.dataset.panel
    document.getElementById(`panel-${target}`)?.classList.add('active')
  })
})

// ---- Resize handles ----
function setupResize(handleId: string, panelId: string, side: 'left' | 'right'): void {
  const handle = document.getElementById(handleId)!
  const panel = document.getElementById(panelId)!
  let startX = 0, startW = 0

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX
    startW = panel.offsetWidth
    handle.classList.add('active')
    const onMove = (ev: MouseEvent) => {
      const dx = side === 'left' ? ev.clientX - startX : startX - ev.clientX
      panel.style.width = `${Math.max(150, startW + dx)}px`
    }
    const onUp = () => {
      handle.classList.remove('active')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}

setupResize('resize-handle-left', 'left-panel', 'left')
setupResize('resize-handle-right', 'right-panel', 'right')

// ---- Titlebar buttons ----
document.getElementById('btn-open')!.addEventListener('click', async () => {
  const dir = await electronAPI.openDirectoryDialog()
  if (dir) openPack(dir)
})

document.getElementById('btn-template')!.addEventListener('click', () => {
  if (packInfo) {
    templateDialog.open(packInfo, (filePath) => {
      openFile(filePath)
      reloadPack()
    })
  }
})

document.getElementById('btn-save')!.addEventListener('click', () => {
  editor.saveActiveTab()
})

// ---- Path picker integration ----
document.addEventListener('insert-path', ((e: CustomEvent) => {
  editor.insertAtCursor(e.detail)
}) as EventListener)

// ---- Drag and drop (pack folder from OS) ----
document.addEventListener('dragover', (e) => { e.preventDefault() })
document.addEventListener('drop', async (e) => {
  // Only handle OS-level drops (not tree drag-and-drop which stops propagation)
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const first = files[0]
    const path = (first as any).path as string | undefined
    if (path) {
      openPack(path)
    }
  }
})

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
    e.preventDefault()
    document.getElementById('btn-open')!.click()
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault()
    document.getElementById('btn-template')!.click()
  }

  // Delete selected item
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.cm-editor')) return

    const selected = document.querySelector('.tree-item.selected')
    if (selected) {
      const path = selected.getAttribute('data-path')
      if (path) {
        e.preventDefault()
        electronAPI.pathBasename(path).then(name => {
          if (confirm(`确定要删除 "${name}" 吗？`)) {
            electronAPI.deleteFile(path).then(() => reloadPack())
          }
        })
      }
    }
  }

  // F2 rename
  if (e.key === 'F2') {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const selected = document.querySelector('.tree-item.selected')
    if (selected) {
      const path = selected.getAttribute('data-path')
      if (path) {
        e.preventDefault()
        startInlineRename(path)
      }
    }
  }
})
