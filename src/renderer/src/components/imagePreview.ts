import { formatFileSize } from '../utils/resourceTypes'
import { getRelativePath } from '../utils/pathResolver'

export class ImagePreviewComponent {
  private imageContainer: HTMLElement
  private fileInfoContainer: HTMLElement
  private packRoot: string = ''

  constructor(imageContainer: HTMLElement, fileInfoContainer: HTMLElement) {
    this.imageContainer = imageContainer
    this.fileInfoContainer = fileInfoContainer
  }

  setPackRoot(root: string): void {
    this.packRoot = root
  }

  showImage(imagePath: string): void {
    this.imageContainer.innerHTML = ''
    const img = document.createElement('img')
    img.src = `local-res://${imagePath}`
    img.alt = imagePath.substring(imagePath.lastIndexOf('/') + 1)
    img.onerror = () => {
      this.imageContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px">无法加载图片</div>'
    }
    this.imageContainer.appendChild(img)
  }

  showAudio(audioPath: string): void {
    this.imageContainer.innerHTML = ''
    const wrapper = document.createElement('div')
    wrapper.className = 'audio-preview-widget'

    const icon = document.createElement('div')
    icon.className = 'audio-icon'
    icon.textContent = '🔊'
    wrapper.appendChild(icon)

    const name = document.createElement('div')
    name.className = 'audio-name'
    name.textContent = audioPath.substring(audioPath.lastIndexOf('/') + 1)
    wrapper.appendChild(name)

    const audio = document.createElement('audio')
    audio.src = `local-res://${audioPath}`
    audio.preload = 'metadata'

    const controls = document.createElement('div')
    controls.className = 'audio-controls'

    const playBtn = document.createElement('button')
    playBtn.className = 'audio-play-btn'
    playBtn.textContent = '▶'
    playBtn.title = '播放 / 暂停'

    const timeDisplay = document.createElement('span')
    timeDisplay.className = 'audio-time'
    timeDisplay.textContent = '0:00 / 0:00'

    const progress = document.createElement('input')
    progress.type = 'range'
    progress.className = 'audio-progress'
    progress.min = '0'
    progress.max = '100'
    progress.value = '0'

    const volumeBtn = document.createElement('button')
    volumeBtn.className = 'audio-vol-btn'
    volumeBtn.textContent = '🔉'
    volumeBtn.title = '静音'

    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play()
        playBtn.textContent = '⏸'
      } else {
        audio.pause()
        playBtn.textContent = '▶'
      }
    })

    audio.addEventListener('loadedmetadata', () => {
      timeDisplay.textContent = `0:00 / ${fmtTime(audio.duration)}`
    })

    audio.addEventListener('timeupdate', () => {
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
      progress.value = String(pct)
      timeDisplay.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`
    })

    audio.addEventListener('ended', () => {
      playBtn.textContent = '▶'
      progress.value = '0'
    })

    progress.addEventListener('input', () => {
      if (audio.duration) {
        audio.currentTime = (parseFloat(progress.value) / 100) * audio.duration
      }
    })

    let muted = false
    volumeBtn.addEventListener('click', () => {
      muted = !muted
      audio.muted = muted
      volumeBtn.textContent = muted ? '🔇' : '🔉'
    })

    controls.appendChild(playBtn)
    controls.appendChild(progress)
    controls.appendChild(timeDisplay)
    controls.appendChild(volumeBtn)
    wrapper.appendChild(controls)
    wrapper.appendChild(audio)

    this.imageContainer.appendChild(wrapper)
  }

  showFileInfo(filePath: string, size: number, ext: string): void {
    const name = filePath.substring(filePath.lastIndexOf('/') + 1)
    const relative = this.packRoot ? getRelativePath(filePath, this.packRoot) : name

    this.fileInfoContainer.innerHTML = ''

    const rows: [string, string][] = [
      ['文件名', name],
      ['路径', relative],
      ['大小', formatFileSize(size)],
      ['类型', ext.toUpperCase().replace('.', '')]
    ]

    for (const [label, value] of rows) {
      const row = document.createElement('div')
      row.className = 'file-info-row'

      const labelEl = document.createElement('span')
      labelEl.className = 'file-info-label'
      labelEl.textContent = label

      const valueEl = document.createElement('span')
      valueEl.textContent = value

      row.appendChild(labelEl)
      row.appendChild(valueEl)
      this.fileInfoContainer.appendChild(row)
    }
  }

  showPropertiesRefs(content: string, packRoot: string): void {
    const textureMatch = content.match(/^texture=(.+)$/m)
    const modelMatch = content.match(/^model=(.+)$/m)

    if (textureMatch) {
      let texPath = textureMatch[1].trim()
      if (!texPath.endsWith('.png')) texPath += '.png'

      const possiblePaths = [
        `${packRoot}/assets/minecraft/${texPath}`,
        `${packRoot}/assets/minecraft/textures/${texPath}`,
      ]

      for (const p of possiblePaths) {
        const img = document.createElement('img')
        img.src = `local-res://${p}`
        img.onload = () => this.showImage(p)
        img.style.display = 'none'
        document.body.appendChild(img)
        setTimeout(() => img.remove(), 100)
      }
    }

    if (modelMatch || textureMatch) {
      const info = document.createElement('div')
      info.style.marginTop = '8px'
      info.style.fontSize = '11px'
      info.style.color = 'var(--text-secondary)'
      if (textureMatch) {
        const p = document.createElement('div')
        p.innerHTML = `<span style="color:var(--text-muted)">texture:</span> ${escapeHtml(textureMatch[1].trim())}`
        info.appendChild(p)
      }
      if (modelMatch) {
        const p = document.createElement('div')
        p.innerHTML = `<span style="color:var(--text-muted)">model:</span> ${escapeHtml(modelMatch[1].trim())}`
        info.appendChild(p)
      }
      this.fileInfoContainer.appendChild(info)
    }
  }

  clear(): void {
    // stop any playing audio first
    const audio = this.imageContainer.querySelector('audio')
    if (audio) { audio.pause(); audio.src = '' }
    this.imageContainer.innerHTML = ''
    this.fileInfoContainer.innerHTML = ''
  }
}

function fmtTime(sec: number): string {
  if (!sec || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
