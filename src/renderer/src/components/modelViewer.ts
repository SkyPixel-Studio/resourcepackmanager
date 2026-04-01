import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ResolvedModel, ResolvedElement, ResolvedFace } from '../utils/mcModelParser'
import { resolveMinecraftModel, texturePathToFile, isMinecraftModel } from '../utils/mcModelParser'
import type { RawMcModel } from '../utils/mcModelParser'

declare const electronAPI: {
  readFile: (filePath: string) => Promise<string>
  pathExists: (p: string) => Promise<boolean>
}

const MC_SCALE = 1 / 16
const FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north'] as const

const MISSING_TEXTURE_COLOR = 0xff00ff

export class ModelViewerComponent {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private modelGroup: THREE.Group
  private animId: number | null = null
  private resizeObserver: ResizeObserver
  private textureCache: Map<string, THREE.Texture> = new Map()
  private packRoot: string
  private disposed = false

  constructor(container: HTMLElement, packRoot: string) {
    this.container = container
    this.packRoot = packRoot

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'model-viewer-canvas'

    const canvasWrap = container.querySelector('.model-viewer-canvas-wrap')
    if (canvasWrap) {
      canvasWrap.appendChild(this.canvas)
    } else {
      container.appendChild(this.canvas)
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0xf0f0f0)
    this.renderer.shadowMap.enabled = false

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    this.camera.position.set(2, 1.8, 2)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1
    this.controls.target.set(0.5, 0.5, 0.5)
    this.controls.minDistance = 0.3
    this.controls.maxDistance = 20

    this.setupLights()
    this.setupGrid()

    this.modelGroup = new THREE.Group()
    this.scene.add(this.modelGroup)

    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(canvasWrap || container)

    this.onResize()
    this.animate()
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    this.scene.add(ambient)

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8)
    dir1.position.set(5, 8, 4)
    this.scene.add(dir1)

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3)
    dir2.position.set(-3, -2, -4)
    this.scene.add(dir2)
  }

  private setupGrid(): void {
    const grid = new THREE.GridHelper(4, 16, 0xcccccc, 0xe0e0e0)
    grid.position.set(0.5, 0, 0.5)
    this.scene.add(grid)

    // Axis indicator
    const axesSize = 0.3
    const axes = new THREE.AxesHelper(axesSize)
    axes.position.set(-0.5, 0, -0.5)
    this.scene.add(axes)
  }

  private onResize(): void {
    const parent = this.canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private animate(): void {
    if (this.disposed) return
    this.animId = requestAnimationFrame(() => this.animate())
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  async loadModel(filePath: string): Promise<void> {
    try {
      const json = JSON.parse(await electronAPI.readFile(filePath))
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))

      const parentResolver = async (parentRef: string): Promise<RawMcModel | null> => {
        const resolved = await this.resolveParentPath(parentRef, fileDir)
        if (!resolved) return null
        try {
          const content = await electronAPI.readFile(resolved)
          return JSON.parse(content)
        } catch {
          return null
        }
      }

      const model = await resolveMinecraftModel(json, parentResolver)
      await this.buildMeshes(model)
    } catch (e) {
      console.error('Failed to load model:', e)
    }
  }

  private async resolveParentPath(parentRef: string, fileDir: string): Promise<string | null> {
    let ref = parentRef
    if (ref.startsWith('builtin/') || ref === 'item/generated') return null

    // Strip minecraft: prefix
    if (ref.includes(':')) {
      const [namespace, path] = ref.split(':', 2)
      ref = `${namespace}/models/${path}`
    } else {
      ref = `minecraft/models/${ref}`
    }
    if (!ref.endsWith('.json')) ref += '.json'

    const absPath = `${this.packRoot}/assets/${ref}`
    if (await electronAPI.pathExists(absPath)) return absPath

    // Try relative resolution from the same directory
    const relative = `${fileDir}/${parentRef.split('/').pop()}.json`
    if (await electronAPI.pathExists(relative)) return relative

    return null
  }

  private async buildMeshes(model: ResolvedModel): Promise<void> {
    // Clear existing
    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0]
      this.modelGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    }

    for (const element of model.elements) {
      const mesh = await this.createElementMesh(element, model.textures)
      if (mesh) this.modelGroup.add(mesh)
    }
  }

  private async createElementMesh(
    element: ResolvedElement,
    _textures: Record<string, string>
  ): Promise<THREE.Mesh | null> {
    const from = element.from.map(v => v * MC_SCALE) as [number, number, number]
    const to = element.to.map(v => v * MC_SCALE) as [number, number, number]

    const sizeX = Math.abs(to[0] - from[0])
    const sizeY = Math.abs(to[1] - from[1])
    const sizeZ = Math.abs(to[2] - from[2])

    if (sizeX <= 0 && sizeY <= 0 && sizeZ <= 0) return null

    const geometry = new THREE.BoxGeometry(
      Math.max(sizeX, 0.001),
      Math.max(sizeY, 0.001),
      Math.max(sizeZ, 0.001)
    )

    const cx = (from[0] + to[0]) / 2
    const cy = (from[1] + to[1]) / 2
    const cz = (from[2] + to[2]) / 2

    // Build materials for each face (Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z)
    const materials = await Promise.all(
      FACE_ORDER.map(face => this.createFaceMaterial(element.faces[face], element, face))
    )

    const mesh = new THREE.Mesh(geometry, materials)
    mesh.position.set(cx, cy, cz)

    if (element.rotation) {
      const origin = element.rotation.origin.map(v => v * MC_SCALE)
      const angle = THREE.MathUtils.degToRad(element.rotation.angle)

      // Move to rotation origin, rotate, move back
      const pivot = new THREE.Group()
      pivot.position.set(origin[0], origin[1], origin[2])

      mesh.position.set(cx - origin[0], cy - origin[1], cz - origin[2])

      switch (element.rotation.axis) {
        case 'x': pivot.rotation.x = angle; break
        case 'y': pivot.rotation.y = angle; break
        case 'z': pivot.rotation.z = angle; break
      }

      if (element.rotation.rescale) {
        const cos = Math.cos(Math.abs(angle))
        if (cos !== 0) {
          const factor = 1 / cos
          switch (element.rotation.axis) {
            case 'x':
              pivot.scale.set(1, factor, factor); break
            case 'y':
              pivot.scale.set(factor, 1, factor); break
            case 'z':
              pivot.scale.set(factor, factor, 1); break
          }
        }
      }

      pivot.add(mesh)
      return pivot as unknown as THREE.Mesh
    }

    return mesh
  }

  private async createFaceMaterial(
    face: ResolvedFace | undefined,
    _element: ResolvedElement,
    _faceName: string
  ): Promise<THREE.MeshStandardMaterial> {
    if (!face || !face.texture || face.texture.startsWith('#')) {
      return new THREE.MeshStandardMaterial({
        color: face ? MISSING_TEXTURE_COLOR : 0x000000,
        transparent: !face,
        opacity: face ? 1 : 0,
        side: THREE.DoubleSide
      })
    }

    const texturePath = texturePathToFile(face.texture, this.packRoot)
    const texture = await this.loadTexture(texturePath)

    if (!texture) {
      return new THREE.MeshStandardMaterial({
        color: MISSING_TEXTURE_COLOR,
        side: THREE.DoubleSide
      })
    }

    const mat = new THREE.MeshStandardMaterial({
      map: texture.clone(),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide
    })

    // Apply UV from MC's 0-16 space to 0-1
    const uv = face.uv
    const u1 = uv[0] / 16
    const v1 = 1 - uv[3] / 16
    const u2 = uv[2] / 16
    const v2 = 1 - uv[1] / 16

    if (mat.map) {
      mat.map.repeat.set(u2 - u1, v2 - v1)
      mat.map.offset.set(u1, v1)
      mat.map.needsUpdate = true
    }

    return mat
  }

  private async loadTexture(filePath: string): Promise<THREE.Texture | null> {
    if (this.textureCache.has(filePath)) {
      return this.textureCache.get(filePath)!
    }

    const exists = await electronAPI.pathExists(filePath)
    if (!exists) {
      return null
    }

    return new Promise<THREE.Texture | null>((resolve) => {
      const loader = new THREE.TextureLoader()
      loader.load(
        `local-res://${filePath}`,
        (tex) => {
          tex.magFilter = THREE.NearestFilter
          tex.minFilter = THREE.NearestFilter
          tex.colorSpace = THREE.SRGBColorSpace
          tex.wrapS = THREE.ClampToEdgeWrapping
          tex.wrapT = THREE.ClampToEdgeWrapping
          this.textureCache.set(filePath, tex)
          resolve(tex)
        },
        undefined,
        () => {
          resolve(null)
        }
      )
    })
  }

  resetCamera(): void {
    this.camera.position.set(2, 1.8, 2)
    this.controls.target.set(0.5, 0.5, 0.5)
    this.controls.update()
  }

  toggleWireframe(): void {
    this.modelGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of materials) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.wireframe = !mat.wireframe
          }
        }
      }
    })
  }

  dispose(): void {
    this.disposed = true
    if (this.animId !== null) cancelAnimationFrame(this.animId)
    this.resizeObserver.disconnect()
    this.controls.dispose()

    this.modelGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => m.dispose())
      }
    })

    this.textureCache.forEach(tex => tex.dispose())
    this.textureCache.clear()

    this.renderer.dispose()
  }
}

export function createModelViewer(
  container: HTMLElement,
  filePath: string,
  packRoot: string,
  onViewSource: () => void
): ModelViewerComponent {
  const viewer = document.createElement('div')
  viewer.className = 'media-viewer model-viewer-container'

  const name = filePath.substring(filePath.lastIndexOf('/') + 1)

  const header = document.createElement('div')
  header.className = 'media-viewer-header model-viewer-header'

  const titleSpan = document.createElement('span')
  titleSpan.textContent = name
  header.appendChild(titleSpan)

  const toolbar = document.createElement('div')
  toolbar.className = 'model-viewer-toolbar'

  const resetBtn = document.createElement('button')
  resetBtn.className = 'model-viewer-btn'
  resetBtn.textContent = '⟳ 重置视角'
  toolbar.appendChild(resetBtn)

  const wireBtn = document.createElement('button')
  wireBtn.className = 'model-viewer-btn'
  wireBtn.textContent = '▦ 线框'
  toolbar.appendChild(wireBtn)

  const srcBtn = document.createElement('button')
  srcBtn.className = 'model-viewer-btn'
  srcBtn.textContent = '{ } 查看源代码'
  srcBtn.addEventListener('click', onViewSource)
  toolbar.appendChild(srcBtn)

  header.appendChild(toolbar)
  viewer.appendChild(header)

  const canvasWrap = document.createElement('div')
  canvasWrap.className = 'model-viewer-canvas-wrap'
  viewer.appendChild(canvasWrap)

  container.appendChild(viewer)

  const component = new ModelViewerComponent(viewer, packRoot)

  resetBtn.addEventListener('click', () => component.resetCamera())
  wireBtn.addEventListener('click', () => component.toggleWireframe())

  component.loadModel(filePath)

  return component
}

export { isMinecraftModel }
