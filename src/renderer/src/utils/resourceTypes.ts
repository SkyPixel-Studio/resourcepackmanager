export type ResourceType =
  | 'cit_properties'
  | 'model'
  | 'texture'
  | 'sound'
  | 'blockstate'
  | 'lang'
  | 'font'
  | 'shader'
  | 'bbmodel'
  | 'mcmeta'
  | 'journal'
  | 'other'

export interface ResourceFile {
  name: string
  path: string
  relativePath: string
  resourcePath: string
  type: ResourceType
  size: number
  ext: string
  namespace: string
  citInfo?: {
    citType: string
    items: string
    texture: string
    model: string
    nbtMatch: string
  }
}

export interface PackInfo {
  rootPath: string
  packFormat: number
  description: string
  namespaces: string[]
  files: ResourceFile[]
  fileTree: FileTreeNode[]
}

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
  ext: string
  size: number
}

export function getFileIcon(ext: string, isDir: boolean): string {
  if (isDir) return '📁'
  switch (ext) {
    case '.json': return '📋'
    case '.properties': return '⚙️'
    case '.png': case '.jpg': case '.jpeg': case '.tga': return '🖼️'
    case '.ogg': case '.wav': return '🔊'
    case '.bbmodel': return '🧊'
    case '.mcmeta': return '📦'
    case '.lang': return '🌐'
    case '.fsh': case '.vsh': return '✨'
    case '.journal': return '📖'
    default: return '📄'
  }
}

export function getTypeTag(type: ResourceType): { label: string; cssClass: string } {
  switch (type) {
    case 'cit_properties': return { label: 'CIT', cssClass: 'tag-cit' }
    case 'model': return { label: '模型', cssClass: 'tag-model' }
    case 'texture': return { label: '贴图', cssClass: 'tag-texture' }
    case 'sound': return { label: '声音', cssClass: 'tag-sound' }
    case 'bbmodel': return { label: 'BB模型', cssClass: 'tag-model' }
    case 'blockstate': return { label: '方块状态', cssClass: 'tag-other' }
    case 'mcmeta': return { label: 'MCMeta', cssClass: 'tag-other' }
    case 'lang': return { label: '语言', cssClass: 'tag-other' }
    case 'journal': return { label: '日志', cssClass: 'tag-other' }
    default: return { label: '其他', cssClass: 'tag-other' }
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getEditorLanguage(ext: string): 'json' | 'properties' | 'text' {
  switch (ext) {
    case '.json': case '.mcmeta': return 'json'
    case '.properties': return 'properties'
    default: return 'text'
  }
}
