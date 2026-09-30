import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveNavMode, toggledPref, clampNavWidth, resizeByKey, groupInitials, groupTint, moveInList, flyoutPosition,
  groupKey, groupHoldsItem, railSections, orderResources, isOthersGroup, NAV_DEFAULT_WIDTH, NAV_MIN_WIDTH, NAV_MAX_WIDTH, NAV_TINT_COUNT
} from '../../src/utils/navModel.js'

describe('sidebar mode', () => {
  it('defaults to the rail below 1280px and to the expanded sidebar above', () => {
    expect(resolveNavMode({ wide: false })).toBe('rail')
    expect(resolveNavMode({ wide: true })).toBe('expanded')
  })
  it('remembers the choice of the user and lets the phone drawer win', () => {
    expect(resolveNavMode({ pref: 'expanded', wide: false })).toBe('expanded')
    expect(resolveNavMode({ pref: 'rail', wide: true })).toBe('rail')
    expect(resolveNavMode({ pref: 'rail', wide: true, drawer: true })).toBe('drawer')
    expect(resolveNavMode({ pref: 'nonsense', wide: false })).toBe('rail')
  })
  it('toggles between rail and expanded', () => {
    expect(toggledPref('rail')).toBe('expanded')
    expect(toggledPref('expanded')).toBe('rail')
  })
})

describe('sidebar width', () => {
  it('stays between 200 and 360 and falls back to the default', () => {
    expect(clampNavWidth(100)).toBe(NAV_MIN_WIDTH)
    expect(clampNavWidth(999)).toBe(NAV_MAX_WIDTH)
    expect(clampNavWidth(300.4)).toBe(300)
    expect(clampNavWidth('abc')).toBe(NAV_DEFAULT_WIDTH)
  })
  it('is adjustable with the keyboard', () => {
    expect(resizeByKey(248, 'ArrowRight')).toBe(264)
    expect(resizeByKey(248, 'ArrowLeft')).toBe(232)
    expect(resizeByKey(205, 'ArrowLeft')).toBe(NAV_MIN_WIDTH)
    expect(resizeByKey(248, 'Home')).toBe(NAV_MIN_WIDTH)
    expect(resizeByKey(248, 'End')).toBe(NAV_MAX_WIDTH)
    expect(resizeByKey(248, 'x')).toBe(248)
  })
})

describe('group badges', () => {
  it('derives up to two capital letters and ignores numbering', () => {
    expect(groupInitials('Catalog')).toBe('CA')
    expect(groupInitials('2. Exploration App')).toBe('EA')
    expect(groupInitials('1. BKK109')).toBe('BK')
    expect(groupInitials('CMS')).toBe('CM')
    expect(groupInitials('x')).toBe('X')
    expect(groupInitials('甲乙丙')).toBe('甲乙')
    expect(groupInitials('123')).toBe('12')
    expect(groupInitials('')).toBe('?')
  })
  it('gives the same colour to the same name, always inside the palette', () => {
    expect(groupTint('Catalog')).toBe(groupTint('Catalog'))
    const seen = new Set(['Catalog', 'CMS', 'Table', 'abc', 'Dealerships', 'Others', 'Object', 'Towers', 'Content'].map((name) => groupTint(name)))
    expect(seen.size).toBeGreaterThan(2)
    for (const tint of seen) {
      expect(tint).toBeGreaterThanOrEqual(1)
      expect(tint).toBeLessThanOrEqual(NAV_TINT_COUNT)
    }
  })
})

describe('groups, sections and flyout', () => {
  const groups = [{ name: 'CMS', list: [{ title: 'a' }] }, { name: { enUS: 'abc' }, list: [{ title: 'b' }] }, { name: 'TL_OTHERS', list: [{ title: 'x' }, { title: 'y' }] }]
  it('identifies groups and the group of the selected item', () => {
    expect(groupKey(groups[1])).toBe('abc')
    expect(groupHoldsItem(groups[0], { group: 'CMS' })).toBe(true)
    expect(groupHoldsItem(groups[1], { group: { enUS: 'abc' } })).toBe(true)
    expect(groupHoldsItem(groups[2], { title: 'no group' })).toBe(true)
    expect(groupHoldsItem(groups[0], null)).toBe(false)
    expect(isOthersGroup(groups[2])).toBe(true)
  })
  it('puts the resources of Others into a separate bottom section', () => {
    const sections = railSections(groups)
    expect(sections.groups.map((g) => g.name)).toEqual(['CMS', { enUS: 'abc' }])
    expect(sections.loose.map((r) => r.title)).toEqual(['x', 'y'])
  })
  it('orders resources naturally', () => {
    const list = [{ t: 'Item 10' }, { t: 'item 2' }, { t: 'Alpha' }]
    expect(orderResources(list, (r) => r.t).map((r) => r.t)).toEqual(['Alpha', 'item 2', 'Item 10'])
  })
  it('moves inside the flyout list and wraps around', () => {
    expect(moveInList(-1, 'ArrowDown', 3)).toBe(0)
    expect(moveInList(2, 'ArrowDown', 3)).toBe(0)
    expect(moveInList(0, 'ArrowUp', 3)).toBe(2)
    expect(moveInList(1, 'Home', 3)).toBe(0)
    expect(moveInList(1, 'End', 3)).toBe(2)
    expect(moveInList(1, 'x', 3)).toBe(1)
    expect(moveInList(0, 'ArrowDown', 0)).toBe(-1)
  })
  it('keeps the flyout inside the viewport', () => {
    expect(flyoutPosition({ top: 100, right: 50 }, 700, 200)).toEqual({ left: 58, top: 100 })
    expect(flyoutPosition({ top: 650, right: 50 }, 700, 200)).toEqual({ left: 58, top: 492 })
    expect(flyoutPosition({ top: -20, right: 50 }, 700, 200).top).toBe(8)
  })
})

describe('rail colours', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../src/styles/tokens.css'), 'utf8')
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const block = (name) => {
    const start = css.indexOf(name === 'light' ? '/* ---- Light palette' : '/* ---- Dark palette')
    return name === 'light' ? css.slice(start, css.indexOf('/* ---- Dark palette')) : css.slice(start)
  }
  for (const palette of ['light', 'dark']) {
    it(`keeps the badge initials readable on every tint (${palette})`, () => {
      const text = block(palette)
      for (let i = 1; i <= NAV_TINT_COUNT; i += 1) {
        const bg = new RegExp(`--cms-rail-tint-${i}-bg:\\s*(#[0-9a-fA-F]{6})`).exec(text)[1]
        const fg = new RegExp(`--cms-rail-tint-${i}-fg:\\s*(#[0-9a-fA-F]{6})`).exec(text)[1]
        expect(ratio(bg, fg), `tint ${i} ${palette}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})

describe('menu icons from Settings', () => {
  it('maps each group to the url of its image, skipping incomplete entries', async () => {
    const { menuIconMap, groupSettingsName } = await import('../../src/utils/navModel.js')
    const settings = { menuGroups: [
      { group: 'CMS', icon: [{ url: '/a.png' }] },
      { group: 'Text', icon: [] },
      { icon: [{ url: '/b.png' }] },
      { group: 'Media', icon: [{ url: '/c.svg' }] }
    ] }
    expect(menuIconMap(settings)).toEqual({ CMS: '/a.png', Media: '/c.svg' })
    expect(menuIconMap(undefined)).toEqual({})
    expect(menuIconMap({})).toEqual({})
    expect(groupSettingsName({ name: { enUS: 'CMS', zhCN: '内容' } })).toBe('CMS')
    expect(groupSettingsName({ name: 'Plain' })).toBe('Plain')
  })
})
