import * as fs from 'fs'
import * as path from 'path'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  ext: string
}

export async function readDirectory(dirPath: string): Promise<DirEntry[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  const result: DirEntry[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dirPath, entry.name)
    const isDir = entry.isDirectory()
    let size = 0
    if (!isDir) {
      try {
        const stat = await fs.promises.stat(fullPath)
        size = stat.size
      } catch {
        // ignore
      }
    }
    result.push({
      name: entry.name,
      path: fullPath,
      isDirectory: isDir,
      size,
      ext: isDir ? '' : path.extname(entry.name).toLowerCase()
    })
  }

  result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return result
}

export async function readFileContent(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf-8')
}

export async function writeFileContent(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, content, 'utf-8')
}

export async function getFileStats(filePath: string): Promise<{ size: number; mtime: number } | null> {
  try {
    const stat = await fs.promises.stat(filePath)
    return { size: stat.size, mtime: stat.mtimeMs }
  } catch {
    return null
  }
}

export async function walkDirectory(dirPath: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else {
        results.push(fullPath)
      }
    }
  }

  await walk(dirPath)
  return results
}

export async function createFile(filePath: string, content: string = ''): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, content, 'utf-8')
}

export async function createDirectory(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

export async function deleteFile(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { recursive: true, force: true })
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  await fs.promises.rename(oldPath, newPath)
}

export async function copyFile(src: string, dest: string): Promise<void> {
  const stat = await fs.promises.stat(src)
  if (stat.isDirectory()) {
    await copyDirRecursive(src, dest)
  } else {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await fs.promises.copyFile(src, dest)
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true })
  const entries = await fs.promises.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath)
    } else {
      await fs.promises.copyFile(srcPath, destPath)
    }
  }
}

export async function moveFile(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  try {
    await fs.promises.rename(src, dest)
  } catch {
    // cross-device move: copy then delete
    await copyFile(src, dest)
    await deleteFile(src)
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(p)).isDirectory()
  } catch {
    return false
  }
}
