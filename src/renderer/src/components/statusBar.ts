import { getRelativePath } from '../utils/pathResolver'

export class StatusBarComponent {
  private pathEl: HTMLElement
  private encodingEl: HTMLElement
  private cursorEl: HTMLElement
  private packInfoEl: HTMLElement
  private packRoot: string = ''

  constructor() {
    this.pathEl = document.getElementById('status-path')!
    this.encodingEl = document.getElementById('status-encoding')!
    this.cursorEl = document.getElementById('status-cursor')!
    this.packInfoEl = document.getElementById('status-pack-info')!
  }

  setPackRoot(root: string): void {
    this.packRoot = root
  }

  setFilePath(path: string): void {
    this.pathEl.textContent = this.packRoot
      ? getRelativePath(path, this.packRoot)
      : path
  }

  setCursor(line: number, col: number): void {
    this.cursorEl.textContent = `行 ${line}, 列 ${col}`
  }

  setPackInfo(format: number, description: string): void {
    const desc = description.replace(/§[0-9a-fk-or]/g, '').replace(/\\n/g, ' ')
    this.packInfoEl.textContent = `格式: ${format} | ${desc}`.substring(0, 60)
  }

  setReady(): void {
    this.pathEl.textContent = '就绪'
    this.cursorEl.textContent = ''
  }
}
