import { ResourceFile, ResourceType, getTypeTag, formatFileSize, getFileIcon } from '../utils/resourceTypes'

export interface FlatViewCallbacks {
  onFileOpen: (path: string) => void
  onContextMenu: (e: MouseEvent, file: ResourceFile) => void
}

type FilterType = 'all' | ResourceType

export class FlatViewComponent {
  private listContainer: HTMLElement
  private searchInput: HTMLInputElement
  private tabButtons: NodeListOf<HTMLElement>
  private callbacks: FlatViewCallbacks
  private files: ResourceFile[] = []
  private currentFilter: FilterType = 'all'
  private searchQuery = ''

  constructor(
    listContainer: HTMLElement,
    searchInput: HTMLInputElement,
    tabButtons: NodeListOf<HTMLElement>,
    callbacks: FlatViewCallbacks
  ) {
    this.listContainer = listContainer
    this.searchInput = searchInput
    this.tabButtons = tabButtons
    this.callbacks = callbacks
    this.setupEvents()
  }

  private setupEvents(): void {
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.toLowerCase()
      this.renderList()
    })

    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabButtons.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.currentFilter = (btn.dataset.type || 'all') as FilterType
        this.renderList()
      })
    })
  }

  setFiles(files: ResourceFile[]): void {
    this.files = files
    this.renderList()
  }

  private getFilteredFiles(): ResourceFile[] {
    return this.files.filter(f => {
      if (this.currentFilter !== 'all') {
        if (this.currentFilter === 'other') {
          const mainTypes: ResourceType[] = ['cit_properties', 'model', 'texture', 'sound']
          if (mainTypes.includes(f.type)) return false
        } else if (f.type !== this.currentFilter) {
          return false
        }
      }

      if (this.searchQuery) {
        const q = this.searchQuery
        const matchName = f.name.toLowerCase().includes(q)
        const matchPath = f.relativePath.toLowerCase().includes(q)
        const matchCit = f.citInfo && (
          f.citInfo.items.toLowerCase().includes(q) ||
          f.citInfo.nbtMatch.toLowerCase().includes(q)
        )
        if (!matchName && !matchPath && !matchCit) return false
      }

      return true
    })
  }

  private renderList(): void {
    const filtered = this.getFilteredFiles()
    this.listContainer.innerHTML = ''

    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'flat-item'
      empty.style.justifyContent = 'center'
      empty.style.color = 'var(--text-muted)'
      empty.textContent = this.files.length === 0 ? '未打开资源包' : '没有匹配的文件'
      this.listContainer.appendChild(empty)
      return
    }

    const fragment = document.createDocumentFragment()
    for (const file of filtered) {
      const item = document.createElement('div')
      item.className = 'flat-item'

      const icon = document.createElement('span')
      icon.textContent = getFileIcon(file.ext, false)
      icon.style.flexShrink = '0'
      item.appendChild(icon)

      const nameEl = document.createElement('span')
      nameEl.className = 'flat-item-name'
      nameEl.textContent = file.name
      item.appendChild(nameEl)

      const pathEl = document.createElement('span')
      pathEl.className = 'flat-item-path'
      pathEl.textContent = file.relativePath
      pathEl.title = file.relativePath
      item.appendChild(pathEl)

      const tag = getTypeTag(file.type)
      const tagEl = document.createElement('span')
      tagEl.className = `flat-item-tag ${tag.cssClass}`
      tagEl.textContent = tag.label
      item.appendChild(tagEl)

      if (file.citInfo) {
        if (file.citInfo.items) {
          const citTag = document.createElement('span')
          citTag.className = 'flat-item-tag tag-other'
          citTag.textContent = file.citInfo.items
          citTag.style.fontSize = '10px'
          item.appendChild(citTag)
        }
      }

      const sizeEl = document.createElement('span')
      sizeEl.className = 'flat-item-size'
      sizeEl.textContent = formatFileSize(file.size)
      item.appendChild(sizeEl)

      item.addEventListener('click', () => {
        this.callbacks.onFileOpen(file.path)
      })

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        this.callbacks.onContextMenu(e, file)
      })

      fragment.appendChild(item)
    }

    this.listContainer.appendChild(fragment)
  }
}
