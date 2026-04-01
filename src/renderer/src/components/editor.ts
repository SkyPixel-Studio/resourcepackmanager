import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine,
  drawSelection, highlightSpecialChars, Decoration, WidgetType,
  ViewPlugin, ViewUpdate, hoverTooltip
} from '@codemirror/view'
import { EditorState, Extension, StateField, StateEffect } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { StreamLanguage } from '@codemirror/language'
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion } from '@codemirror/autocomplete'
import { tags } from '@lezer/highlight'
import { getEditorLanguage } from '../utils/resourceTypes'

// --- Light theme (IntelliJ Light inspired) ---
const editorHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#0033b3', fontWeight: '600' },
  { tag: tags.operator, color: '#333333' },
  { tag: tags.number, color: '#1750eb' },
  { tag: tags.string, color: '#067d17' },
  { tag: tags.comment, color: '#8c8c8c', fontStyle: 'italic' },
  { tag: tags.propertyName, color: '#871094' },
  { tag: tags.variableName, color: '#333333' },
  { tag: tags.typeName, color: '#0033b3' },
  { tag: tags.bool, color: '#0033b3', fontWeight: '600' },
  { tag: tags.null, color: '#0033b3', fontWeight: '600' },
  { tag: tags.punctuation, color: '#333333' },
  { tag: tags.meta, color: '#9e880d' },
  { tag: tags.atom, color: '#0033b3' },
  { tag: tags.labelName, color: '#871094' },
  { tag: tags.name, color: '#333333' },
])

// --- Properties language ---
const propertiesLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.peek() === '#') {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.sol()) {
      if (stream.match(/^[a-zA-Z_][\w.*-]*/)) {
        return 'propertyName'
      }
    }
    if (stream.eat('=')) {
      return 'operator'
    }
    if (stream.match(/\\u[0-9a-fA-F]{4}/)) {
      return 'number'
    }
    if (stream.match(/iregex:|regex:|pattern:/)) {
      return 'keyword'
    }
    stream.next()
    return 'string'
  },
  startState() { return {} }
})

function getLanguageExtension(lang: 'json' | 'properties' | 'text'): Extension {
  switch (lang) {
    case 'json': return json()
    case 'properties': return propertiesLanguage
    default: return []
  }
}

// ============================================================
// Unicode inline conversion (like Cursor ghost text)
// Triggers on: 1) typing non-ASCII  2) cursor landing on a line with non-ASCII
// Works on ALL text file types, not just .properties
// ============================================================

function toUnicodeEscape(str: string): string {
  let r = ''
  for (const ch of str) {
    const c = ch.codePointAt(0)!
    r += c > 127 ? `\\u${c.toString(16).padStart(4, '0')}` : ch
  }
  return r
}

function fromUnicodeEscape(str: string): string {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function hasNonAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return true
  }
  return false
}

// Find the non-ASCII span to convert on a given line.
// For .properties: only convert the value part (after '=').
// For other files: convert any non-ASCII segment the cursor is touching.
function findConvertTarget(
  lineText: string, lineFrom: number, cursorOffset: number, isProperties: boolean
): { from: number; to: number; original: string; converted: string } | null {
  if (isProperties) {
    const eqIdx = lineText.indexOf('=')
    if (eqIdx < 0) return null
    const valueText = lineText.substring(eqIdx + 1)
    if (!hasNonAscii(valueText)) return null
    const converted = toUnicodeEscape(valueText)
    if (converted === valueText) return null
    return {
      from: lineFrom + eqIdx + 1,
      to: lineFrom + lineText.length,
      original: valueText,
      converted
    }
  }

  // For non-properties: find the contiguous run of characters containing
  // non-ASCII around the cursor position. We expand outward from the cursor
  // to capture the full "word" or segment that has non-ASCII chars in it.
  // Strategy: just use the whole line content if it has non-ASCII.
  if (!hasNonAscii(lineText)) return null

  // Skip comment lines
  const trimmed = lineText.trimStart()
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) return null

  const converted = toUnicodeEscape(lineText)
  if (converted === lineText) return null
  return {
    from: lineFrom,
    to: lineFrom + lineText.length,
    original: lineText,
    converted
  }
}

// Ghost widget shown at end of line
class UnicodeGhostWidget extends WidgetType {
  constructor(readonly preview: string) { super() }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'unicode-ghost'
    const maxLen = 60
    const display = this.preview.length > maxLen
      ? this.preview.substring(0, maxLen) + '…'
      : this.preview
    span.textContent = `  → ${display}  [Tab]`
    return span
  }
  eq(other: UnicodeGhostWidget) { return this.preview === other.preview }
  ignoreEvent() { return true }
}

interface UnicodeGhost {
  from: number
  to: number
  original: string
  converted: string
}

const setGhost = StateEffect.define<UnicodeGhost | null>()

const unicodeGhostField = StateField.define<UnicodeGhost | null>({
  create() { return null },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhost)) return e.value
    }
    if (tr.docChanged) return null
    return value
  }
})

const unicodeGhostDecorations = EditorView.decorations.compute(
  [unicodeGhostField],
  (state) => {
    const ghost = state.field(unicodeGhostField)
    if (!ghost) return Decoration.none
    const deco = Decoration.widget({
      widget: new UnicodeGhostWidget(ghost.converted),
      side: 1
    })
    return Decoration.set([deco.range(ghost.to)])
  }
)

// Plugin: detect non-ASCII and show ghost on both input and cursor movement
function unicodeGhostPlugin(isProperties: boolean): Extension {
  return ViewPlugin.fromClass(class {
    update(update: ViewUpdate) {
      const shouldCheck = update.docChanged || update.selectionSet

      if (!shouldCheck) return

      const state = update.state
      const pos = state.selection.main.head
      const line = state.doc.lineAt(pos)
      const cursorOffset = pos - line.from

      const target = findConvertTarget(line.text, line.from, cursorOffset, isProperties)

      const currentGhost = state.field(unicodeGhostField, false)

      if (target) {
        // Only dispatch if ghost changed
        if (currentGhost &&
          currentGhost.from === target.from &&
          currentGhost.to === target.to &&
          currentGhost.converted === target.converted) {
          return
        }
        update.view.dispatch({
          effects: setGhost.of(target)
        })
      } else if (currentGhost) {
        update.view.dispatch({
          effects: setGhost.of(null)
        })
      }
    }
  })
}

// Tab accepts, Escape dismisses
function unicodeGhostKeymap(): Extension {
  return keymap.of([{
    key: 'Tab',
    run(view) {
      const ghost = view.state.field(unicodeGhostField, false)
      if (!ghost) return false
      view.dispatch({
        changes: { from: ghost.from, to: ghost.to, insert: ghost.converted },
        effects: setGhost.of(null)
      })
      return true
    }
  }, {
    key: 'Escape',
    run(view) {
      const ghost = view.state.field(unicodeGhostField, false)
      if (!ghost) return false
      view.dispatch({ effects: setGhost.of(null) })
      return true
    }
  }])
}

// ============================================================
// Unicode hover tooltip (decode \uXXXX on hover)
// ============================================================

function unicodeHoverTooltip(): Extension {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos)
    const text = line.text
    const offset = pos - line.from

    const re = /\\u[0-9a-fA-F]{4}/g
    const sequences: { start: number; end: number }[] = []
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      sequences.push({ start: match.index, end: match.index + match[0].length })
    }

    if (sequences.length === 0) return null

    // Merge sequences that are nearby (with arbitrary characters in between)
    // into a single decodable group, so "\u7b2c1\u7ae0 A \u4e2d\u6587"
    // becomes one group instead of breaking at ASCII gaps.
    const MAX_GAP = 20
    const groups: { start: number; end: number }[] = []
    let cur = { ...sequences[0] }
    for (let i = 1; i < sequences.length; i++) {
      const s = sequences[i]
      if (s.start - cur.end <= MAX_GAP) {
        cur.end = s.end
      } else {
        groups.push(cur)
        cur = { ...s }
      }
    }
    groups.push(cur)

    let target: { start: number; end: number } | null = null
    for (const g of groups) {
      if (offset >= g.start && offset <= g.end) {
        target = g
        break
      }
    }
    if (!target) return null

    const raw = text.substring(target.start, target.end)
    const decoded = fromUnicodeEscape(raw)
    if (decoded === raw) return null

    return {
      pos: line.from + target.start,
      end: line.from + target.end,
      above: true,
      create() {
        const dom = document.createElement('div')
        dom.className = 'unicode-tooltip'
        dom.innerHTML = `<span class="unicode-tooltip-label">Unicode:</span> <span class="unicode-tooltip-value">${escapeHtml(decoded)}</span>`
        return { dom }
      }
    }
  }, { hideOnChange: true, hoverTime: 200 })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ============================================================
// CSS for ghost text and tooltip
// ============================================================
const unicodeStyles = EditorView.theme({
  '.unicode-ghost': {
    color: '#067d17',
    opacity: '0.5',
    fontStyle: 'italic',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  '.unicode-tooltip': {
    padding: '4px 10px',
    fontSize: '13px',
    fontFamily: 'var(--font-ui)',
    lineHeight: '1.5',
    background: '#fff',
    color: '#333',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  '.unicode-tooltip-label': {
    color: '#999',
    marginRight: '4px',
  },
  '.unicode-tooltip-value': {
    color: '#1750eb',
    fontWeight: '500',
    fontSize: '14px',
  },
})

// ============================================================
// Editor Tab / Component
// ============================================================

export interface EditorTab {
  path: string
  name: string
  content: string
  originalContent: string
  modified: boolean
  language: 'json' | 'properties' | 'text'
  view: EditorView | null
  scrollPos?: { top: number; left: number }
}

export interface EditorCallbacks {
  onSave: (path: string, content: string) => void
  onModifiedChange: (path: string, modified: boolean) => void
  onCursorChange: (line: number, col: number) => void
  onMediaClear?: () => void
}

export class EditorComponent {
  private editorContainer: HTMLElement
  private tabsContainer: HTMLElement
  private welcomeScreen: HTMLElement
  private tabs: EditorTab[] = []
  private activeTab: EditorTab | null = null
  private callbacks: EditorCallbacks

  constructor(
    editorContainer: HTMLElement,
    tabsContainer: HTMLElement,
    welcomeScreen: HTMLElement,
    callbacks: EditorCallbacks
  ) {
    this.editorContainer = editorContainer
    this.tabsContainer = tabsContainer
    this.welcomeScreen = welcomeScreen
    this.callbacks = callbacks
  }

  async openFile(path: string, content: string): Promise<void> {
    const existing = this.tabs.find(t => t.path === path)
    if (existing) {
      this.activateTab(existing)
      return
    }

    const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
    const name = path.substring(path.lastIndexOf('/') + 1)
    const language = getEditorLanguage(ext)

    const tab: EditorTab = {
      path, name, content,
      originalContent: content,
      modified: false,
      language,
      view: null
    }

    this.tabs.push(tab)
    this.renderTabs()
    this.activateTab(tab)
  }

  private activateTab(tab: EditorTab): void {
    if (this.activeTab && this.activeTab.view) {
      this.activeTab.scrollPos = {
        top: this.activeTab.view.scrollDOM.scrollTop,
        left: this.activeTab.view.scrollDOM.scrollLeft
      }
      this.activeTab.content = this.activeTab.view.state.doc.toString()
      this.activeTab.view.destroy()
      this.activeTab.view = null
    }

    this.activeTab = tab
    this.welcomeScreen.style.display = 'none'

    // Remove any media viewers (image/audio/3D model) that may be overlaying
    this.editorContainer.querySelectorAll('.media-viewer').forEach(el => {
      const aud = el.querySelector('audio')
      if (aud) { aud.pause(); aud.src = '' }
      el.remove()
    })
    this.callbacks.onMediaClear?.()

    const existingEditor = this.editorContainer.querySelector('.cm-editor')
    if (existingEditor) existingEditor.remove()

    const isProp = tab.language === 'properties'

    const view = new EditorView({
      state: EditorState.create({
        doc: tab.content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          autocompletion(),
          syntaxHighlighting(editorHighlight),
          getLanguageExtension(tab.language),
          // Unicode features
          unicodeGhostField,
          unicodeGhostDecorations,
          unicodeGhostPlugin(isProp),
          unicodeGhostKeymap(),
          unicodeHoverTooltip(),
          unicodeStyles,
          // Keymaps
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
            {
              key: 'Mod-s',
              run: () => { this.saveActiveTab(); return true }
            },
            {
              key: 'Mod-Shift-p',
              run: () => {
                document.dispatchEvent(new CustomEvent('open-path-picker'))
                return true
              }
            }
          ]),
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              const currentContent = update.state.doc.toString()
              const wasModified = tab.modified
              tab.modified = currentContent !== tab.originalContent
              tab.content = currentContent
              if (wasModified !== tab.modified) {
                this.callbacks.onModifiedChange(tab.path, tab.modified)
                this.renderTabs()
              }
            }
            if (update.selectionSet) {
              const pos = update.state.selection.main.head
              const line = update.state.doc.lineAt(pos)
              this.callbacks.onCursorChange(line.number, pos - line.from + 1)
            }
          }),
          EditorView.theme({ '&': { height: '100%' } })
        ]
      }),
      parent: this.editorContainer
    })

    tab.view = view

    if (tab.scrollPos) {
      view.scrollDOM.scrollTop = tab.scrollPos.top
      view.scrollDOM.scrollLeft = tab.scrollPos.left
    }

    this.renderTabs()
  }

  private renderTabs(): void {
    this.tabsContainer.innerHTML = ''
    for (const tab of this.tabs) {
      const tabEl = document.createElement('div')
      tabEl.className = 'editor-tab'
      if (tab === this.activeTab) tabEl.classList.add('active')
      if (tab.modified) tabEl.classList.add('modified')

      const nameSpan = document.createElement('span')
      nameSpan.className = 'tab-name'
      nameSpan.textContent = tab.name
      tabEl.appendChild(nameSpan)

      const closeBtn = document.createElement('button')
      closeBtn.className = 'tab-close'
      closeBtn.textContent = '\u00d7'
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.closeTab(tab)
      })
      tabEl.appendChild(closeBtn)

      tabEl.addEventListener('click', () => this.activateTab(tab))
      tabEl.addEventListener('mousedown', (e) => {
        if (e.button === 1) { e.preventDefault(); this.closeTab(tab) }
      })

      this.tabsContainer.appendChild(tabEl)
    }
  }

  private closeTab(tab: EditorTab): void {
    if (tab.view) { tab.view.destroy(); tab.view = null }

    const idx = this.tabs.indexOf(tab)
    this.tabs.splice(idx, 1)

    if (tab === this.activeTab) {
      this.activeTab = null
      if (this.tabs.length > 0) {
        this.activateTab(this.tabs[Math.min(idx, this.tabs.length - 1)])
      } else {
        this.welcomeScreen.style.display = ''
        const ed = this.editorContainer.querySelector('.cm-editor')
        if (ed) ed.remove()
      }
    }
    this.renderTabs()
  }

  saveActiveTab(): void {
    if (!this.activeTab || !this.activeTab.view) return
    const content = this.activeTab.view.state.doc.toString()
    this.callbacks.onSave(this.activeTab.path, content)
    this.activeTab.originalContent = content
    this.activeTab.modified = false
    this.renderTabs()
  }

  insertAtCursor(text: string): void {
    if (!this.activeTab || !this.activeTab.view) return
    const view = this.activeTab.view
    const pos = view.state.selection.main.head
    view.dispatch({ changes: { from: pos, insert: text } })
    view.focus()
  }

  getActiveFilePath(): string | null {
    return this.activeTab?.path ?? null
  }

  getActiveContent(): string | null {
    if (!this.activeTab?.view) return null
    return this.activeTab.view.state.doc.toString()
  }

  updateFileContent(path: string, content: string): void {
    const tab = this.tabs.find(t => t.path === path)
    if (tab && tab.view) {
      tab.view.dispatch({
        changes: { from: 0, to: tab.view.state.doc.length, insert: content }
      })
    }
  }
}
