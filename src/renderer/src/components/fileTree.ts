import { FileTreeNode, getFileIcon } from '../utils/resourceTypes'

export interface FileTreeCallbacks {
  onFileOpen: (path: string) => void
  onContextMenu: (e: MouseEvent, node: FileTreeNode) => void
  onDrop: (srcPath: string, destDir: string) => void
}

export class FileTreeComponent {
  private container: HTMLElement
  private callbacks: FileTreeCallbacks
  private selectedPath: string | null = null
  private dragSrcPath: string | null = null
  private expandedPaths: Set<string> = new Set()
  private currentNodes: FileTreeNode[] = []

  private searchInput: HTMLInputElement
  private searchWrap: HTMLElement
  private filterQuery = ''

  private typeaheadBuffer = ''
  private typeaheadTimer: ReturnType<typeof setTimeout> | null = null

  constructor(container: HTMLElement, callbacks: FileTreeCallbacks) {
    this.container = container
    this.callbacks = callbacks

    this.searchWrap = document.createElement('div')
    this.searchWrap.className = 'tree-search-wrap'
    this.searchInput = document.createElement('input')
    this.searchInput.type = 'text'
    this.searchInput.className = 'tree-search-input'
    this.searchInput.placeholder = '搜索文件树...'
    this.searchWrap.appendChild(this.searchInput)

    container.parentElement!.insertBefore(this.searchWrap, container)

    this.searchInput.addEventListener('input', () => {
      this.filterQuery = this.searchInput.value.trim().toLowerCase()
      this.applyRender()
    })

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.searchInput.value = ''
        this.filterQuery = ''
        this.applyRender()
        this.searchInput.blur()
      }
      e.stopPropagation()
    })

    this.container.setAttribute('tabindex', '0')
    this.container.style.outline = 'none'
    this.container.addEventListener('keydown', (e) => this.handleTreeKeydown(e))
  }

  render(nodes: FileTreeNode[]): void {
    this.currentNodes = nodes
    this.applyRender()
  }

  private applyRender(): void {
    this.container.innerHTML = ''
    const fragment = document.createDocumentFragment()
    if (this.filterQuery) {
      const filtered = this.filterNodes(this.currentNodes, this.filterQuery)
      this.renderNodes(fragment, filtered, 0, true)
    } else {
      this.renderNodes(fragment, this.currentNodes, 0, false)
    }
    this.container.appendChild(fragment)
  }

  private filterNodes(nodes: FileTreeNode[], query: string): FileTreeNode[] {
    const result: FileTreeNode[] = []
    for (const node of nodes) {
      if (node.isDirectory && node.children) {
        const filteredChildren = this.filterNodes(node.children, query)
        if (filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren })
        } else if (node.name.toLowerCase().includes(query)) {
          result.push({ ...node, children: [] })
        }
      } else {
        if (node.name.toLowerCase().includes(query)) {
          result.push(node)
        }
      }
    }
    return result
  }

  private handleTreeKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      this.navigateTree(e.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      this.expandSelected()
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      this.collapseSelected()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (this.selectedPath) {
        const item = this.container.querySelector(
          `.tree-item[data-path="${CSS.escape(this.selectedPath)}"]`
        ) as HTMLElement | null
        if (item) {
          if (item.dataset.isDir === '1') {
            this.toggleDirectory(this.selectedPath)
          } else {
            this.callbacks.onFileOpen(this.selectedPath)
          }
        }
      }
      return
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      this.typeaheadJump(e.key)
      return
    }
  }

  private getVisibleItems(): HTMLElement[] {
    return Array.from(this.container.querySelectorAll<HTMLElement>('.tree-item')).filter(el => {
      let parent = el.parentElement
      while (parent && parent !== this.container) {
        if (parent.classList.contains('tree-children') && !parent.classList.contains('expanded')) {
          return false
        }
        parent = parent.parentElement
      }
      return true
    })
  }

  private navigateTree(direction: number): void {
    const visible = this.getVisibleItems()
    if (visible.length === 0) return

    const currentIdx = visible.findIndex(el => el.dataset.path === this.selectedPath)
    let nextIdx: number
    if (currentIdx < 0) {
      nextIdx = direction > 0 ? 0 : visible.length - 1
    } else {
      nextIdx = currentIdx + direction
      if (nextIdx < 0) nextIdx = 0
      if (nextIdx >= visible.length) nextIdx = visible.length - 1
    }

    const nextItem = visible[nextIdx]
    const path = nextItem.dataset.path!
    this.selectItem(path)
    nextItem.scrollIntoView({ block: 'nearest' })
  }

  private expandSelected(): void {
    if (!this.selectedPath) return
    const childContainer = this.container.querySelector(
      `.tree-children[data-path="${CSS.escape(this.selectedPath)}"]`
    ) as HTMLElement | null
    if (!childContainer) return
    if (childContainer.classList.contains('expanded')) {
      this.navigateTree(1)
      return
    }
    childContainer.classList.add('expanded')
    this.expandedPaths.add(this.selectedPath)
    const item = this.container.querySelector(
      `.tree-item[data-path="${CSS.escape(this.selectedPath)}"]`
    )
    const toggle = item?.querySelector('.tree-toggle')
    if (toggle) toggle.classList.add('expanded')
  }

  private collapseSelected(): void {
    if (!this.selectedPath) return
    const childContainer = this.container.querySelector(
      `.tree-children[data-path="${CSS.escape(this.selectedPath)}"]`
    ) as HTMLElement | null
    if (childContainer && childContainer.classList.contains('expanded')) {
      childContainer.classList.remove('expanded')
      this.expandedPaths.delete(this.selectedPath)
      const item = this.container.querySelector(
        `.tree-item[data-path="${CSS.escape(this.selectedPath)}"]`
      )
      const toggle = item?.querySelector('.tree-toggle')
      if (toggle) toggle.classList.remove('expanded')
      return
    }
    // If already collapsed or is a file, jump to parent directory
    const currentItem = this.container.querySelector(
      `.tree-item[data-path="${CSS.escape(this.selectedPath)}"]`
    )
    if (!currentItem) return
    const parentChildren = currentItem.parentElement
    if (parentChildren && parentChildren.classList.contains('tree-children')) {
      const parentPath = parentChildren.dataset.path
      if (parentPath) {
        this.selectItem(parentPath)
        const parentItem = this.container.querySelector(
          `.tree-item[data-path="${CSS.escape(parentPath)}"]`
        ) as HTMLElement | null
        parentItem?.scrollIntoView({ block: 'nearest' })
      }
    }
  }

  private toggleDirectory(path: string): void {
    const childContainer = this.container.querySelector(
      `.tree-children[data-path="${CSS.escape(path)}"]`
    ) as HTMLElement | null
    if (!childContainer) return
    const isExpanded = childContainer.classList.toggle('expanded')
    if (isExpanded) {
      this.expandedPaths.add(path)
    } else {
      this.expandedPaths.delete(path)
    }
    const item = this.container.querySelector(`.tree-item[data-path="${CSS.escape(path)}"]`)
    const toggle = item?.querySelector('.tree-toggle')
    if (toggle) toggle.classList.toggle('expanded', isExpanded)
  }

  private typeaheadJump(char: string): void {
    if (this.typeaheadTimer) clearTimeout(this.typeaheadTimer)
    this.typeaheadBuffer += char.toLowerCase()
    this.typeaheadTimer = setTimeout(() => { this.typeaheadBuffer = '' }, 800)

    const visible = this.getVisibleItems()
    const query = this.typeaheadBuffer

    const currentIdx = visible.findIndex(el => el.dataset.path === this.selectedPath)

    // Search starting after current selection, then wrap around
    const search = (startIdx: number): HTMLElement | null => {
      for (let i = 0; i < visible.length; i++) {
        const idx = (startIdx + i) % visible.length
        const nameEl = visible[idx].querySelector('.tree-name')
        const name = nameEl?.textContent?.toLowerCase() || ''
        if (name.startsWith(query)) return visible[idx]
      }
      return null
    }

    // If typing a single repeated char, cycle through matches starting after current
    const isSingleChar = query.length > 1 && new Set(query).size === 1
    const startFrom = isSingleChar || query.length === 1
      ? (currentIdx + 1) % visible.length
      : 0

    const match = search(startFrom)
    if (match) {
      this.selectItem(match.dataset.path!)
      match.scrollIntoView({ block: 'nearest' })
    }
  }

  focusSearch(): void {
    this.searchInput.focus()
    this.searchInput.select()
  }

  private renderNodes(parent: Node, nodes: FileTreeNode[], depth: number, forceExpand: boolean): void {
    for (const node of nodes) {
      const item = document.createElement('div')
      item.className = 'tree-item'
      if (node.path === this.selectedPath) item.classList.add('selected')
      item.dataset.path = node.path
      item.dataset.isDir = node.isDirectory ? '1' : '0'

      item.draggable = true
      item.addEventListener('dragstart', (e) => {
        this.dragSrcPath = node.path
        e.dataTransfer!.effectAllowed = 'move'
        e.dataTransfer!.setData('text/plain', node.path)
        item.classList.add('dragging')
      })
      item.addEventListener('dragend', () => {
        this.dragSrcPath = null
        item.classList.remove('dragging')
        this.container.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'))
      })

      if (node.isDirectory) {
        item.addEventListener('dragover', (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (this.dragSrcPath && this.dragSrcPath !== node.path) {
            e.dataTransfer!.dropEffect = 'move'
            item.classList.add('drop-target')
          }
        })
        item.addEventListener('dragleave', () => {
          item.classList.remove('drop-target')
        })
        item.addEventListener('drop', (e) => {
          e.preventDefault()
          e.stopPropagation()
          item.classList.remove('drop-target')
          const srcPath = e.dataTransfer!.getData('text/plain')
          if (srcPath && srcPath !== node.path) {
            this.callbacks.onDrop(srcPath, node.path)
          }
        })
      }

      for (let i = 0; i < depth; i++) {
        const indent = document.createElement('span')
        indent.className = 'tree-indent'
        item.appendChild(indent)
      }

      if (node.isDirectory) {
        const toggle = document.createElement('span')
        toggle.className = 'tree-toggle'
        toggle.textContent = '▶'
        item.appendChild(toggle)
      } else {
        const spacer = document.createElement('span')
        spacer.className = 'tree-toggle'
        item.appendChild(spacer)
      }

      const icon = document.createElement('span')
      icon.className = 'tree-icon'
      icon.textContent = getFileIcon(node.ext, node.isDirectory)
      item.appendChild(icon)

      const nameSpan = document.createElement('span')
      nameSpan.className = 'tree-name'

      if (this.filterQuery && node.name.toLowerCase().includes(this.filterQuery)) {
        const lowerName = node.name.toLowerCase()
        const idx = lowerName.indexOf(this.filterQuery)
        const before = node.name.substring(0, idx)
        const match = node.name.substring(idx, idx + this.filterQuery.length)
        const after = node.name.substring(idx + this.filterQuery.length)
        if (before) nameSpan.appendChild(document.createTextNode(before))
        const mark = document.createElement('mark')
        mark.className = 'tree-search-highlight'
        mark.textContent = match
        nameSpan.appendChild(mark)
        if (after) nameSpan.appendChild(document.createTextNode(after))
      } else {
        nameSpan.textContent = node.name
      }

      item.appendChild(nameSpan)
      parent.appendChild(item)

      if (node.isDirectory && node.children) {
        const childContainer = document.createElement('div')
        childContainer.className = 'tree-children'
        childContainer.dataset.path = node.path
        this.renderNodes(childContainer, node.children, depth + 1, forceExpand)
        parent.appendChild(childContainer)

        if (forceExpand || this.expandedPaths.has(node.path)) {
          childContainer.classList.add('expanded')
          const toggle = item.querySelector('.tree-toggle')
          if (toggle) toggle.classList.add('expanded')
        }

        childContainer.addEventListener('dragover', (e) => {
          e.preventDefault()
          if (this.dragSrcPath && this.dragSrcPath !== node.path) {
            e.dataTransfer!.dropEffect = 'move'
            item.classList.add('drop-target')
          }
        })
        childContainer.addEventListener('dragleave', (e) => {
          if (!childContainer.contains(e.relatedTarget as Node)) {
            item.classList.remove('drop-target')
          }
        })
        childContainer.addEventListener('drop', (e) => {
          e.preventDefault()
          e.stopPropagation()
          item.classList.remove('drop-target')
          const srcPath = e.dataTransfer!.getData('text/plain')
          if (srcPath && srcPath !== node.path) {
            this.callbacks.onDrop(srcPath, node.path)
          }
        })

        item.addEventListener('click', (e) => {
          e.stopPropagation()
          const toggle = item.querySelector('.tree-toggle')
          const isExpanded = childContainer.classList.toggle('expanded')
          if (toggle) {
            toggle.classList.toggle('expanded', isExpanded)
          }
          if (isExpanded) {
            this.expandedPaths.add(node.path)
          } else {
            this.expandedPaths.delete(node.path)
          }
          this.selectItem(node.path)
          this.container.focus()
        })
      } else {
        item.addEventListener('click', (e) => {
          e.stopPropagation()
          this.selectItem(node.path)
          this.callbacks.onFileOpen(node.path)
          this.container.focus()
        })

        if (node.ext === '.png' || node.ext === '.jpg') {
          item.addEventListener('mouseenter', (e) => {
            this.showImageTooltip(e, node.path)
          })
          item.addEventListener('mouseleave', () => {
            this.hideImageTooltip()
          })
        }
      }

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.selectItem(node.path)
        this.callbacks.onContextMenu(e, node)
      })
    }
  }

  private selectItem(path: string): void {
    this.selectedPath = path
    this.container.querySelectorAll('.tree-item.selected').forEach(el =>
      el.classList.remove('selected')
    )
    const item = this.container.querySelector(`[data-path="${CSS.escape(path)}"]`)
    if (item && item.classList.contains('tree-item')) {
      item.classList.add('selected')
    }
  }

  private showImageTooltip(e: MouseEvent, imagePath: string): void {
    this.hideImageTooltip()
    const tooltip = document.createElement('div')
    tooltip.className = 'tooltip'
    tooltip.id = 'image-tooltip'
    const img = document.createElement('img')
    img.src = `local-res://${imagePath}`
    img.onerror = () => tooltip.remove()
    tooltip.appendChild(img)
    tooltip.style.left = `${e.clientX + 16}px`
    tooltip.style.top = `${e.clientY}px`
    document.body.appendChild(tooltip)
  }

  private hideImageTooltip(): void {
    document.getElementById('image-tooltip')?.remove()
  }
}
