export function computeResourcePath(filePath: string, packRoot: string): string {
  let relative = filePath
    .replace(packRoot, '')
    .replace(/\\/g, '/')
    .replace(/^\//, '')

  const assetsIdx = relative.indexOf('assets/')
  if (assetsIdx >= 0) {
    relative = relative.substring(assetsIdx + 'assets/'.length)
    const slashIdx = relative.indexOf('/')
    if (slashIdx >= 0) {
      relative = relative.substring(slashIdx + 1)
    }
  }

  return relative.replace(/\.[^/.]+$/, '')
}

export function getTextureResourcePath(filePath: string, packRoot: string): string {
  return computeResourcePath(filePath, packRoot)
}

export function getModelResourcePath(filePath: string, packRoot: string): string {
  return computeResourcePath(filePath, packRoot)
}

export function getSoundResourcePath(filePath: string, packRoot: string): string {
  let relative = filePath
    .replace(packRoot, '')
    .replace(/\\/g, '/')
    .replace(/^\//, '')

  const soundsIdx = relative.indexOf('sounds/')
  if (soundsIdx >= 0) {
    relative = relative.substring(soundsIdx + 'sounds/'.length)
  }

  return relative.replace(/\.[^/.]+$/, '')
}

export function getRelativePath(filePath: string, packRoot: string): string {
  return filePath
    .replace(packRoot, '')
    .replace(/\\/g, '/')
    .replace(/^\//, '')
}

export function toUnicodeEscape(str: string): string {
  let result = ''
  for (const char of str) {
    const code = char.codePointAt(0)!
    if (code > 127) {
      result += `\\u${code.toString(16).padStart(4, '0')}`
    } else {
      result += char
    }
  }
  return result
}

export function fromUnicodeEscape(str: string): string {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
}
