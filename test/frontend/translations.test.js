import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Every TL_ key the admin uses must exist in English and in Chinese, and the two files must stay in step.

const ROOT = path.resolve(__dirname, '../..')
const load = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `${name}.json`), 'utf8'))
const en = load('enUS')
const zh = load('zhCN')

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) {
    return entry.name === 'plugins' || entry.name === '.plugins' ? [] : walk(full)
  }
  return /\.(vue|js)$/.test(entry.name) ? [full] : []
})
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '')

// keys written out in the code
const staticKeys = () => {
  const used = new Map()
  for (const file of walk(path.join(ROOT, 'src'))) {
    const text = stripComments(fs.readFileSync(file, 'utf8'))
    for (const match of text.matchAll(/['"`](TL_[A-Z0-9_]+)['"`]/g)) {
      used.set(match[1], path.relative(ROOT, file).replace(/\\/g, '/'))
    }
  }
  return used
}

// keys the code builds at run time, listed with the values they can take
const ACTIONS = ['CREATE', 'UPDATE', 'DELETE']
const KINDS = ['SAVED', 'CREATED', 'DELETED']
const FILE_TYPES = ['IMAGE', 'FILE']
const LOCALES = ['ENUS', 'ZHCN']
const dynamicKeys = () => [
  ...ACTIONS.map((a) => `TL_ERROR_ON_RECORD_${a}`),
  ...['COMPACT', 'DEFAULT', 'COMFORTABLE'].map((d) => `TL_DENSITY_${d}`),
  ...KINDS.flatMap((k) => [`TL_RECORD_${k}_NAMED`, `TL_RECORD_${k}_GENERIC`]),
  ...FILE_TYPES.flatMap((t) => [
    `TL_TOO_MANY_${t}S`, `TL_INVALID_${t}_TYPE`, `TL_${t}_IS_MANDATORY`, `TL_${t}_IS_TOO_BIG`,
    `TL_CLICK_OR_DRAG_AND_DROP_TO_ADD_${t}`, `TL_CLICK_OR_DRAG_AND_DROP_TO_ADD_${t}S`,
    `TL_MAX_NUMBER_OF_${t}S`, `TL_UNLIMITED_NUMBER_OF_${t}S`
  ]),
  ...['RESOURCE', 'RECORD'].flatMap((w) => [`TL_WS_UPDATES_${w}_TITLE`, `TL_WS_UPDATES_${w}_DESCRIPTION`]),
  ...['CONNECTING', 'CONNECTED', 'RECONNECTING'].map((s) => `TL_WS_UPDATES_${s}`),
  ...LOCALES.map((l) => `TL_${l}`),
  'TL_ARE_YOU_SURE_TO_DELETE_SELECTED_RECORDS'
]

const placeholders = (text) => (String(text).match(/\{\{\s*[\w.]+\s*\}\}/g) || []).map((p) => p.replace(/\s/g, '')).sort()

describe('translations', () => {
  it('has every key used in the code in English', () => {
    const missing = [...staticKeys()].filter(([key]) => !(key in en)).map(([key, file]) => `${key} (${file})`)
    expect(missing, 'add these to i18n/enUS.json and i18n/zhCN.json').toEqual([])
  })

  it('has every key used in the code in Chinese', () => {
    const missing = [...staticKeys()].filter(([key]) => !(key in zh)).map(([key, file]) => `${key} (${file})`)
    expect(missing).toEqual([])
  })

  it('has every key the code builds at run time, in both languages', () => {
    const missing = dynamicKeys().filter((key) => !(key in en) || !(key in zh))
    expect(missing).toEqual([])
  })

  it('has the same keys in English and in Chinese', () => {
    expect(Object.keys(en).filter((key) => !(key in zh)), 'in English only').toEqual([])
    expect(Object.keys(zh).filter((key) => !(key in en)), 'in Chinese only').toEqual([])
  })

  it('has no empty translation and the same placeholders in both languages', () => {
    const empty = Object.keys(en).filter((key) => !String(en[key]).trim() || !String(zh[key] || '').trim())
    expect(empty).toEqual([])
    const different = Object.keys(en).filter((key) => key in zh && placeholders(en[key]).join() !== placeholders(zh[key]).join())
    expect(different, 'placeholders differ').toEqual([])
  })
})
