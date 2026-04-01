export type TemplateType = 'cit_texture' | 'cit_model' | 'enchantment' | 'armor' | 'elytra'

export interface TemplateParams {
  items?: string
  texturePath?: string
  modelPath?: string
  nbtType?: 'name' | 'lore'
  nbtValue?: string
  enchantments?: string
  enchantmentLevels?: string
  armorMaterial?: string
  armorLayer1?: string
  armorLayer2?: string
  weight?: number
}

function toUnicodeEscape(str: string): string {
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

export function generateTemplate(type: TemplateType, params: TemplateParams): string {
  const lines: string[] = []

  switch (type) {
    case 'cit_texture': {
      lines.push('type=item')
      lines.push(`items=${params.items || 'paper'}`)
      lines.push(`texture=${params.texturePath || 'textures/items/example'}`)
      if (params.nbtType === 'name' && params.nbtValue) {
        lines.push(`nbt.display.Name=${toUnicodeEscape(params.nbtValue)}`)
      } else if (params.nbtType === 'lore' && params.nbtValue) {
        lines.push(`nbt.display.Lore.*=iregex:.*${toUnicodeEscape(params.nbtValue)}`)
      }
      if (params.weight && params.weight > 0) {
        lines.push(`weight=${params.weight}`)
      }
      break
    }

    case 'cit_model': {
      lines.push('type=item')
      lines.push(`items=${params.items || 'paper'}`)
      lines.push(`model=${params.modelPath || 'mcpatcher/models/example'}`)
      if (params.nbtType === 'name' && params.nbtValue) {
        lines.push(`nbt.display.Name=${toUnicodeEscape(params.nbtValue)}`)
      } else if (params.nbtType === 'lore' && params.nbtValue) {
        lines.push(`nbt.display.Lore.*=iregex:.*${toUnicodeEscape(params.nbtValue)}`)
      }
      if (params.weight && params.weight > 0) {
        lines.push(`weight=${params.weight}`)
      }
      break
    }

    case 'enchantment': {
      lines.push('type=enchantment')
      lines.push(`items=${params.items || 'diamond_sword'}`)
      lines.push(`texture=${params.texturePath || 'textures/misc/enchant'}`)
      lines.push(`enchantments=${params.enchantments || 'sharpness'}`)
      lines.push(`enchantmentLevels=${params.enchantmentLevels || '1'}`)
      lines.push('blend=add')
      lines.push('speed=1')
      lines.push('rotation=0')
      if (params.weight && params.weight > 0) {
        lines.push(`weight=${params.weight}`)
      }
      break
    }

    case 'armor': {
      const mat = params.armorMaterial || 'diamond'
      lines.push('type=armor')
      lines.push(`items=${mat}_helmet ${mat}_chestplate ${mat}_leggings ${mat}_boots`)
      lines.push(`texture.${mat}_layer_1=${params.armorLayer1 || `textures/models/armor/${mat}_layer_1`}`)
      lines.push(`texture.${mat}_layer_2=${params.armorLayer2 || `textures/models/armor/${mat}_layer_2`}`)
      if (params.nbtType === 'name' && params.nbtValue) {
        lines.push(`nbt.display.Name=${toUnicodeEscape(params.nbtValue)}`)
      }
      if (params.weight && params.weight > 0) {
        lines.push(`weight=${params.weight}`)
      }
      break
    }

    case 'elytra': {
      lines.push('type=elytra')
      lines.push('items=elytra')
      lines.push(`texture=${params.texturePath || 'textures/models/armor/elytra'}`)
      if (params.nbtType === 'name' && params.nbtValue) {
        lines.push(`nbt.display.Name=${toUnicodeEscape(params.nbtValue)}`)
      }
      if (params.weight && params.weight > 0) {
        lines.push(`weight=${params.weight}`)
      }
      break
    }
  }

  return lines.join('\n') + '\n'
}
