import type { ResourceFile } from '../utils/resourceTypes'
import { computeResourcePath } from '../utils/pathResolver'

export class PathHelperComponent {
  private overlay: HTMLElement
  private searchInput: HTMLInputElement
  private listContainer: HTMLElement
  private files: ResourceFile[] = []
  private packRoot: string = ''
  private onSelect: ((resourcePath: string) => void) | null = null

  constructor() {
    this.overlay = document.getElementById('path-picker')!
    this.searchInput = document.getElementById('path-picker-search') as HTMLInputElement
    this.listContainer = document.getElementById('path-picker-list')!

    this.setupEvents()
  }

  private setupEvents(): void {
    document.getElementById('path-picker-close')!.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close()
    })

    this.searchInput.addEventListener('input', () => {
      this.renderList(this.searchInput.value.toLowerCase())
    })

    document.addEventListener('open-path-picker', () => {
      if (this.files.length > 0) {
        this.open(this.files, this.packRoot, (path) => {
          document.dispatchEvent(new CustomEvent('insert-path', { detail: path }))
        })
      }
    })
  }

  setFiles(files: ResourceFile[], packRoot: string): void {
    this.files = files
    this.packRoot = packRoot
  }

  open(files: ResourceFile[], packRoot: string, onSelect: (resourcePath: string) => void): void {
    this.files = files
    this.packRoot = packRoot
    this.onSelect = onSelect
    this.searchInput.value = ''
    this.renderList('')
    this.overlay.style.display = ''
    setTimeout(() => this.searchInput.focus(), 50)
  }

  close(): void {
    this.overlay.style.display = 'none'
    this.onSelect = null
  }

  private renderList(query: string): void {
    this.listContainer.innerHTML = ''

    const filtered = this.files.filter(f => {
      if (f.ext === '.properties' || f.ext === '.mcmeta') return false
      if (!query) return true
      return f.name.toLowerCase().includes(query) ||
             f.resourcePath.toLowerCase().includes(query) ||
             f.relativePath.toLowerCase().includes(query)
    }).slice(0, 100)

    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.style.cssText = 'padding:12px;color:var(--text-muted);text-align:center;font-size:12px'
      empty.textContent = '没有匹配的资源'
      this.listContainer.appendChild(empty)
      return
    }

    const fragment = document.createDocumentFragment()
    for (const file of filtered) {
      const item = document.createElement('div')
      item.className = 'path-picker-item'

      const nameSpan = document.createElement('div')
      nameSpan.className = 'pp-name'
      nameSpan.textContent = file.name

      const pathSpan = document.createElement('div')
      pathSpan.className = 'pp-path'
      pathSpan.textContent = file.resourcePath

      item.appendChild(nameSpan)
      item.appendChild(pathSpan)

      item.addEventListener('click', () => {
        if (this.onSelect) {
          this.onSelect(file.resourcePath)
        }
        this.close()
      })

      fragment.appendChild(item)
    }

    this.listContainer.appendChild(fragment)
  }

  getResourcePath(filePath: string): string {
    return computeResourcePath(filePath, this.packRoot)
  }
}
