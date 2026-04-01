export interface RawMcModel {
  parent?: string
  textures?: Record<string, string>
  elements?: RawElement[]
  display?: Record<string, unknown>
}

interface RawElement {
  from: [number, number, number]
  to: [number, number, number]
  rotation?: {
    origin?: number[]
    axis?: 'x' | 'y' | 'z'
    angle?: number
    rescale?: boolean
  }
  faces?: Record<string, RawFace>
}

interface RawFace {
  texture?: string
  uv?: [number, number, number, number]
  rotation?: number
  cullface?: string
  tintindex?: number
}

export interface ResolvedModel {
  textures: Record<string, string>
  elements: ResolvedElement[]
}

export interface ResolvedElement {
  from: [number, number, number]
  to: [number, number, number]
  rotation?: { origin: number[]; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean }
  faces: Record<string, ResolvedFace>
}

export interface ResolvedFace {
  texture: string
  uv: [number, number, number, number]
  rotation: number
}

type ParentResolver = (parentPath: string) => Promise<RawMcModel | null>

const MAX_PARENT_DEPTH = 16

export async function resolveMinecraftModel(
  raw: RawMcModel,
  resolveParent: ParentResolver
): Promise<ResolvedModel> {
  const chain = await buildParentChain(raw, resolveParent)

  let mergedTextures: Record<string, string> = {}
  let mergedElements: RawElement[] | undefined

  // parent chain is [child, parent, grandparent, ...]
  // merge bottom-up: grandparent first, then parent overrides, then child overrides
  for (let i = chain.length - 1; i >= 0; i--) {
    const model = chain[i]
    if (model.textures) {
      mergedTextures = { ...mergedTextures, ...model.textures }
    }
    if (model.elements) {
      mergedElements = model.elements
    }
  }

  const resolvedTextures = resolveTextureVariables(mergedTextures)
  const elements = (mergedElements || []).map(el => resolveElement(el, resolvedTextures))

  return { textures: resolvedTextures, elements }
}

async function buildParentChain(
  raw: RawMcModel,
  resolveParent: ParentResolver
): Promise<RawMcModel[]> {
  const chain: RawMcModel[] = [raw]
  let current = raw
  let depth = 0

  while (current.parent && depth < MAX_PARENT_DEPTH) {
    const parentPath = current.parent
    if (parentPath.startsWith('builtin/') || parentPath === 'item/generated') break

    const parent = await resolveParent(parentPath)
    if (!parent) break

    chain.push(parent)
    current = parent
    depth++
  }

  return chain
}

function resolveTextureVariables(textures: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(textures)) {
    resolved[key] = resolveTextureRef(value, textures, 8)
  }

  return resolved
}

function resolveTextureRef(ref: string, textures: Record<string, string>, depth: number): string {
  if (depth <= 0) return ref
  if (ref.startsWith('#')) {
    const varName = ref.substring(1)
    const target = textures[varName]
    if (target) return resolveTextureRef(target, textures, depth - 1)
    return ref
  }
  return ref
}

function resolveElement(el: RawElement, textures: Record<string, string>): ResolvedElement {
  const faces: Record<string, ResolvedFace> = {}

  if (el.faces) {
    for (const [dir, face] of Object.entries(el.faces)) {
      let texPath = ''
      if (face.texture) {
        if (face.texture.startsWith('#')) {
          const varName = face.texture.substring(1)
          texPath = textures[varName] || face.texture
        } else {
          texPath = face.texture
        }
      }

      const uv: [number, number, number, number] = face.uv
        ? face.uv
        : computeDefaultUV(el.from, el.to, dir)

      faces[dir] = {
        texture: texPath,
        uv,
        rotation: face.rotation || 0
      }
    }
  }

  const result: ResolvedElement = {
    from: el.from,
    to: el.to,
    faces
  }

  if (el.rotation && el.rotation.axis && el.rotation.angle !== undefined) {
    result.rotation = {
      origin: el.rotation.origin || [8, 8, 8],
      axis: el.rotation.axis,
      angle: el.rotation.angle,
      rescale: el.rotation.rescale
    }
  }

  return result
}

function computeDefaultUV(
  from: [number, number, number],
  to: [number, number, number],
  face: string
): [number, number, number, number] {
  switch (face) {
    case 'down':
    case 'up':
      return [from[0], from[2], to[0], to[2]]
    case 'north':
    case 'south':
      return [from[0], from[1], to[0], to[1]]
    case 'west':
    case 'east':
      return [from[2], from[1], to[2], to[1]]
    default:
      return [0, 0, 16, 16]
  }
}

export function isMinecraftModel(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const obj = json as Record<string, unknown>
  return Array.isArray(obj.elements) || typeof obj.parent === 'string'
}

export function texturePathToFile(texRef: string, packRoot: string): string {
  let resource = texRef
  if (resource.includes(':')) {
    const [namespace, path] = resource.split(':', 2)
    resource = `${namespace}/textures/${path}`
  } else {
    resource = `minecraft/textures/${resource}`
  }
  if (!resource.endsWith('.png')) resource += '.png'
  return `${packRoot}/assets/${resource}`
}
