import * as fs from 'fs'
import * as path from 'path'
import { walkDirectory } from './fileOps'

export type ResourceType = 'cit_properties' | 'model' | 'texture' | 'sound' | 'blockstate' | 'lang' | 'font' | 'shader' | 'bbmodel' | 'mcmeta' | 'journal' | 'other'

export interface ResourceFile {
  name: string
  path: string
  relativePath: string
  resourcePath: string
  type: ResourceType
  size: number
  ext: string
  namespace: string
  citInfo?: CitInfo
}

export interface CitInfo {
  citType: string
  items: string
  texture: string
  model: string
  nbtMatch: string
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

function classifyFile(relativePath: string, ext: string): ResourceType {
  const lower = relativePath.toLowerCase()

  if (ext === '.properties' && (lower.includes('/cit/') || lower.includes('/mcpatcher/cit/') || lower.includes('/optifine/cit/'))) {
    return 'cit_properties'
  }
  if (ext === '.bbmodel') return 'bbmodel'
  if (ext === '.json') {
    if (lower.includes('/blockstates/')) return 'blockstate'
    if (lower.includes('/models/') || lower.includes('/mcpatcher/models/')) return 'model'
    if (lower.endsWith('.mcmeta') || lower.endsWith('pack.mcmeta')) return 'mcmeta'
    if (lower.includes('/sounds.json')) return 'sound'
    if (lower.includes('/cit/') && ext === '.json') return 'model'
    return 'other'
  }
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.tga') return 'texture'
  if (ext === '.ogg' || ext === '.wav') return 'sound'
  if (ext === '.lang') return 'lang'
  if (ext === '.fsh' || ext === '.vsh') return 'shader'
  if (ext === '.mcmeta') return 'mcmeta'
  if (ext === '.journal') return 'journal'
  return 'other'
}

function parseCitProperties(content: string): CitInfo {
  const lines = content.split('\n')
  const info: CitInfo = { citType: 'item', items: '', texture: '', model: '', nbtMatch: '' }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.substring(0, eqIdx).trim()
    const value = trimmed.substring(eqIdx + 1).trim()

    switch (key) {
      case 'type': info.citType = value; break
      case 'items': info.items = value; break
      case 'texture': info.texture = value; break
      case 'model': info.model = value; break
    }

    if (key.startsWith('nbt.')) {
      info.nbtMatch = info.nbtMatch ? `${info.nbtMatch}; ${key}=${value}` : `${key}=${value}`
    }
  }

  return info
}

function computeResourcePath(relativePath: string, ext: string): string {
  let rp = relativePath.replace(/\\/g, '/')

  const assetsIdx = rp.indexOf('assets/')
  if (assetsIdx >= 0) {
    rp = rp.substring(assetsIdx + 'assets/'.length)
    const slashIdx = rp.indexOf('/')
    if (slashIdx >= 0) {
      rp = rp.substring(slashIdx + 1)
    }
  }

  if (['.png', '.json', '.properties', '.ogg', '.wav'].includes(ext)) {
    rp = rp.replace(new RegExp(ext.replace('.', '\\.') + '$'), '')
  }

  return rp
}

async function buildFileTree(dirPath: string): Promise<FileTreeNode[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  const nodes: FileTreeNode[] = []

  const sorted = entries
    .filter(e => !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  for (const entry of sorted) {
    const fullPath = path.join(dirPath, entry.name)
    const isDir = entry.isDirectory()
    let size = 0
    if (!isDir) {
      try { size = (await fs.promises.stat(fullPath)).size } catch { /* ignore */ }
    }

    const node: FileTreeNode = {
      name: entry.name,
      path: fullPath,
      isDirectory: isDir,
      ext: isDir ? '' : path.extname(entry.name).toLowerCase(),
      size
    }

    if (isDir) {
      node.children = await buildFileTree(fullPath)
    }

    nodes.push(node)
  }

  return nodes
}

export async function parseResourcePack(dirPath: string): Promise<PackInfo | null> {
  const mcmetaPath = path.join(dirPath, 'pack.mcmeta')
  let packFormat = 3
  let description = ''

  try {
    const mcmeta = JSON.parse(await fs.promises.readFile(mcmetaPath, 'utf-8'))
    packFormat = mcmeta.pack?.pack_format ?? 3
    description = mcmeta.pack?.description ?? ''
  } catch {
    // not a valid resource pack, but continue
  }

  const allPaths = await walkDirectory(dirPath)
  const namespaceSet = new Set<string>()
  const files: ResourceFile[] = []

  for (const filePath of allPaths) {
    const relativePath = path.relative(dirPath, filePath)
    const ext = path.extname(filePath).toLowerCase()
    const type = classifyFile(relativePath, ext)
    let size = 0
    try { size = (await fs.promises.stat(filePath)).size } catch { /* ignore */ }

    const relForward = relativePath.replace(/\\/g, '/')
    const assetsMatch = relForward.match(/^assets\/([^/]+)\//)
    const namespace = assetsMatch ? assetsMatch[1] : 'minecraft'
    if (assetsMatch) namespaceSet.add(assetsMatch[1])

    const resourcePath = computeResourcePath(relativePath, ext)

    let citInfo: CitInfo | undefined
    if (type === 'cit_properties') {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        citInfo = parseCitProperties(content)
      } catch { /* ignore */ }
    }

    files.push({
      name: path.basename(filePath),
      path: filePath,
      relativePath: relForward,
      resourcePath,
      type,
      size,
      ext,
      namespace,
      citInfo
    })
  }

  const fileTree = await buildFileTree(dirPath)

  return {
    rootPath: dirPath,
    packFormat,
    description,
    namespaces: Array.from(namespaceSet),
    files,
    fileTree
  }
}
