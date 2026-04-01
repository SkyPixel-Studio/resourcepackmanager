import type { PackInfo } from '../utils/resourceTypes'

declare const electronAPI: {
  generateTemplate: (type: string, params: any) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
}

type TemplateType = 'cit_texture' | 'cit_model' | 'enchantment' | 'armor' | 'elytra'

interface TemplateFields {
  type: HTMLSelectElement
  items: HTMLInputElement
  texture: HTMLInputElement
  model: HTMLInputElement
  enchantments: HTMLInputElement
  enchantLevels: HTMLInputElement
  armorMaterial: HTMLSelectElement
  armorL1: HTMLInputElement
  armorL2: HTMLInputElement
  nbtType: HTMLSelectElement
  nbtValue: HTMLInputElement
  weight: HTMLInputElement
  filename: HTMLInputElement
  preview: HTMLPreElement

  textureGroup: HTMLElement
  modelGroup: HTMLElement
  enchantGroup: HTMLElement
  armorGroup: HTMLElement
  nbtValueGroup: HTMLElement
}

export class TemplateDialogComponent {
  private overlay: HTMLElement
  private fields: TemplateFields
  private packInfo: PackInfo | null = null
  private onCreated: ((filePath: string, content: string) => void) | null = null

  constructor() {
    this.overlay = document.getElementById('template-dialog')!
    this.fields = {
      type: document.getElementById('tpl-type') as HTMLSelectElement,
      items: document.getElementById('tpl-items') as HTMLInputElement,
      texture: document.getElementById('tpl-texture') as HTMLInputElement,
      model: document.getElementById('tpl-model') as HTMLInputElement,
      enchantments: document.getElementById('tpl-enchantments') as HTMLInputElement,
      enchantLevels: document.getElementById('tpl-enchant-levels') as HTMLInputElement,
      armorMaterial: document.getElementById('tpl-armor-material') as HTMLSelectElement,
      armorL1: document.getElementById('tpl-armor-l1') as HTMLInputElement,
      armorL2: document.getElementById('tpl-armor-l2') as HTMLInputElement,
      nbtType: document.getElementById('tpl-nbt-type') as HTMLSelectElement,
      nbtValue: document.getElementById('tpl-nbt-value') as HTMLInputElement,
      weight: document.getElementById('tpl-weight') as HTMLInputElement,
      filename: document.getElementById('tpl-filename') as HTMLInputElement,
      preview: document.getElementById('tpl-preview') as HTMLPreElement,

      textureGroup: document.getElementById('tpl-texture-group')!,
      modelGroup: document.getElementById('tpl-model-group')!,
      enchantGroup: document.getElementById('tpl-enchant-group')!,
      armorGroup: document.getElementById('tpl-armor-group')!,
      nbtValueGroup: document.getElementById('tpl-nbt-value-group')!,
    }

    this.setupEvents()
  }

  private setupEvents(): void {
    this.fields.type.addEventListener('change', () => {
      this.updateVisibility()
      this.updatePreview()
    })

    const inputs = [
      this.fields.items, this.fields.texture, this.fields.model,
      this.fields.enchantments, this.fields.enchantLevels,
      this.fields.armorMaterial, this.fields.armorL1, this.fields.armorL2,
      this.fields.nbtType, this.fields.nbtValue, this.fields.weight,
      this.fields.filename
    ]
    for (const input of inputs) {
      input.addEventListener('input', () => this.updatePreview())
      input.addEventListener('change', () => this.updatePreview())
    }

    this.fields.nbtType.addEventListener('change', () => {
      this.fields.nbtValueGroup.style.display = this.fields.nbtType.value ? '' : 'none'
    })

    document.getElementById('template-close')!.addEventListener('click', () => this.close())
    document.getElementById('tpl-cancel')!.addEventListener('click', () => this.close())
    document.getElementById('tpl-create')!.addEventListener('click', () => this.create())

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close()
    })
  }

  private updateVisibility(): void {
    const type = this.fields.type.value as TemplateType

    this.fields.textureGroup.style.display = 'none'
    this.fields.modelGroup.style.display = 'none'
    this.fields.enchantGroup.style.display = 'none'
    this.fields.armorGroup.style.display = 'none'

    switch (type) {
      case 'cit_texture':
        this.fields.textureGroup.style.display = ''
        break
      case 'cit_model':
        this.fields.modelGroup.style.display = ''
        break
      case 'enchantment':
        this.fields.textureGroup.style.display = ''
        this.fields.enchantGroup.style.display = ''
        break
      case 'armor':
        this.fields.armorGroup.style.display = ''
        break
      case 'elytra':
        this.fields.textureGroup.style.display = ''
        break
    }
  }

  private async updatePreview(): Promise<void> {
    const params = this.buildParams()
    const type = this.fields.type.value
    try {
      const result = await electronAPI.generateTemplate(type, params)
      this.fields.preview.textContent = result
    } catch {
      this.fields.preview.textContent = '(预览生成失败)'
    }
  }

  private buildParams(): any {
    return {
      items: this.fields.items.value || undefined,
      texturePath: this.fields.texture.value || undefined,
      modelPath: this.fields.model.value || undefined,
      nbtType: this.fields.nbtType.value || undefined,
      nbtValue: this.fields.nbtValue.value || undefined,
      enchantments: this.fields.enchantments.value || undefined,
      enchantmentLevels: this.fields.enchantLevels.value || undefined,
      armorMaterial: this.fields.armorMaterial.value || undefined,
      armorLayer1: this.fields.armorL1.value || undefined,
      armorLayer2: this.fields.armorL2.value || undefined,
      weight: parseInt(this.fields.weight.value) || 0,
    }
  }

  private async create(): Promise<void> {
    if (!this.packInfo) return

    const filename = this.fields.filename.value.trim()
    if (!filename) {
      this.fields.filename.focus()
      return
    }

    const safeName = filename.endsWith('.properties') ? filename : `${filename}.properties`
    const content = this.fields.preview.textContent || ''

    const citDir = `${this.packInfo.rootPath}/assets/minecraft/mcpatcher/cit`
    const filePath = `${citDir}/${safeName}`

    try {
      await electronAPI.writeFile(filePath, content)
      if (this.onCreated) {
        this.onCreated(filePath, content)
      }
      this.close()
    } catch (err) {
      console.error('Failed to create template file:', err)
    }
  }

  open(packInfo: PackInfo, onCreated: (filePath: string, content: string) => void): void {
    this.packInfo = packInfo
    this.onCreated = onCreated
    this.resetFields()
    this.updateVisibility()
    this.updatePreview()
    this.overlay.style.display = ''
  }

  close(): void {
    this.overlay.style.display = 'none'
  }

  private resetFields(): void {
    this.fields.type.value = 'cit_texture'
    this.fields.items.value = ''
    this.fields.texture.value = ''
    this.fields.model.value = ''
    this.fields.enchantments.value = ''
    this.fields.enchantLevels.value = ''
    this.fields.armorMaterial.value = 'diamond'
    this.fields.armorL1.value = ''
    this.fields.armorL2.value = ''
    this.fields.nbtType.value = ''
    this.fields.nbtValue.value = ''
    this.fields.weight.value = '0'
    this.fields.filename.value = ''
    this.fields.nbtValueGroup.style.display = 'none'
  }

  setTexturePath(path: string): void {
    this.fields.texture.value = path
    this.updatePreview()
  }

  setModelPath(path: string): void {
    this.fields.model.value = path
    this.fields.type.value = 'cit_model'
    this.updateVisibility()
    this.updatePreview()
  }
}
