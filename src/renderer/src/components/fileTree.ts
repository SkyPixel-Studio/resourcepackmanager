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

  constructor(container: HTMLElement, callbacks: FileTreeCallbacks) {
    this.container = container
    this.callbacks = callbacks
  }

  render(nodes: FileTreeNode[]): void {
    this.container.innerHTML = ''
    const fragment = document.createDocumentFragment()
    this.renderNodes(fragment, nodes, 0)
    this.container.appendChild(fragment)
  }

  private renderNodes(parent: Node, nodes: FileTreeNode[], depth: number): void {
    for (const node of nodes) {
      const item = document.createElement('div')
      item.className = 'tree-item'
      if (node.path === this.selectedPath) item.classList.add('selected')
      item.dataset.path = node.path
      item.dataset.isDir = node.isDirectory ? '1' : '0'

      // Drag source
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

      // Drop target (directories only)
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

      const name = document.createElement('span')
      name.className = 'tree-name'
      name.textContent = node.name
      item.appendChild(name)

      parent.appendChild(item)

      if (node.isDirectory && node.children) {
        const childContainer = document.createElement('div')
        childContainer.className = 'tree-children'
        childContainer.dataset.path = node.path
        this.renderNodes(childContainer, node.children, depth + 1)
        parent.appendChild(childContainer)

        // Restore expanded state
        if (this.expandedPaths.has(node.path)) {
          childContainer.classList.add('expanded')
          const toggle = item.querySelector('.tree-toggle')
          if (toggle) toggle.classList.add('expanded')
        }

        // Drop on child container too
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
        })
      } else {
        item.addEventListener('click', (e) => {
          e.stopPropagation()
          this.selectItem(node.path)
          this.callbacks.onFileOpen(node.path)
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
