import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveNavMode, toggledPref, clampNavWidth, navMaxWidth, resizeByKey, groupInitials, groupTint, moveInList, flyoutPosition,
  groupKey, groupMenuName, groupHoldsItem, groupOwnsItem, groupLevels, groupNames, groupItems, groupTrail, groupOf, groupRows, buildGroupTree, railSections, orderResources, orderGroups, isOthersGroup, NAV_DEFAULT_WIDTH, NAV_MIN_WIDTH, NAV_MAX_WIDTH, NAV_TINT_COUNT
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
  it('is no wider than the content needs, within the limits', () => {
    expect(navMaxWidth([150, 260, 210])).toBe(292)
    expect(navMaxWidth([40])).toBe(NAV_MIN_WIDTH)
    expect(navMaxWidth([900])).toBe(NAV_MAX_WIDTH)
    expect(navMaxWidth([])).toBe(NAV_MAX_WIDTH)
    expect(clampNavWidth(340, 292)).toBe(292)
    expect(clampNavWidth(340, 100)).toBe(NAV_MIN_WIDTH)
    expect(resizeByKey(280, 'ArrowRight', 16, 292)).toBe(292)
    expect(resizeByKey(280, 'End', 16, 292)).toBe(292)
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
  const css = fs.readFileSync(path.resolve(__dirname, '../../src/styles/tokens.scss'), 'utf8')
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

describe('menu group order', () => {
  const groups = [
    { name: 'TL_OTHERS' }, { name: 'TL_PLUGINS' }, { name: 'System' }, { name: { enUS: 'Shop', zhCN: '商店' } },
    { name: { enUS: 'CMS', zhCN: '内容管理系统' } }, { name: 'blog' }, { name: { enUS: 'Analytics', zhCN: '分析' } }
  ]
  const words = { enUS: { TL_OTHERS: 'Others', TL_PLUGINS: 'Plugins' }, zhCN: { TL_OTHERS: '其他', TL_PLUGINS: '插件' } }
  // what TranslateService.get shows: a TL_ key translated, plain text as it is, a per-language name in the language
  const labelIn = (locale) => (name) => (typeof name === 'string' ? (words[locale][name] || name) : name[locale])

  it('puts CMS first and Others last, the rest alphabetically by the displayed name', () => {
    expect(orderGroups(groups, labelIn('enUS'), 'enUS').map((group) => labelIn('enUS')(group.name)))
      .toEqual(['CMS', 'Analytics', 'blog', 'Plugins', 'Shop', 'System', 'Others'])
  })
  it('recognises CMS by its English name, given per language or as plain text', () => {
    expect(orderGroups([{ name: 'Alpha' }, { name: 'CMS' }], labelIn('enUS'))[0].name).toBe('CMS')
    expect(orderGroups(groups, labelIn('zhCN'), 'zhCN')[0].name.enUS).toBe('CMS')
  })
  it('sorts in the admin language', () => {
    const order = orderGroups(groups, labelIn('zhCN'), 'zhCN').map((group) => labelIn('zhCN')(group.name))
    expect(order[0]).toBe('内容管理系统')
    expect(order[order.length - 1]).toBe('其他')
    const middle = order.slice(1, -1)
    expect(middle).toEqual([...middle].sort(new Intl.Collator('zh-CN').compare))
  })
  it('leaves the given list alone and survives a language tag the browser does not know', () => {
    const copy = [...groups]
    expect(orderGroups(groups, labelIn('enUS'), 'not a tag!')).toHaveLength(groups.length)
    expect(groups).toEqual(copy)
  })
})

describe('nested menu groups', () => {
  const item = (title, group, extra = {}) => ({ title, group, ...extra })
  const blogPost = item('posts', ['Content', 'Blog'])
  const blogTag = item('tags', [{ enUS: 'Content', zhCN: '内容' }, { enUS: 'Blog' }])
  const page = item('pages', 'Content')
  const deep = item('drafts', ['Content', 'Blog', 'Private'])
  const loose = item('notes', undefined)
  const syslog = item('Syslog', undefined, { type: 'plugin' })

  it('reads the levels of a group: a name is one level, a list is a path', () => {
    expect(groupLevels('Shop')).toEqual(['Shop'])
    expect(groupLevels(['Content', '', 'Blog'])).toEqual(['Content', 'Blog'])
    expect(groupLevels([])).toEqual([])
    expect(groupLevels(undefined)).toEqual([])
    expect(groupNames([{ enUS: 'Content', zhCN: '内容' }, 'Blog'])).toEqual(['Content', 'Blog'])
  })

  it('files each resource under the levels of its group, and merges the headings that share a name', () => {
    const tree = buildGroupTree([blogPost, page, blogTag, deep, loose, syslog])
    const content = tree.find((group) => group.path[0] === 'Content')
    expect(tree.map((group) => group.path)).toEqual([['TL_OTHERS'], ['TL_PLUGINS'], ['Content']])
    expect(content.list).toEqual([page])
    expect(content.groups.map((group) => group.path)).toEqual([['Content', 'Blog']])
    expect(content.groups[0].list).toEqual([blogPost, blogTag])
    expect(content.groups[0].groups[0].path).toEqual(['Content', 'Blog', 'Private'])
    expect(groupItems(content)).toEqual([page, blogPost, blogTag, deep])
  })

  it('keeps a heading that only holds groups, and drops the ones with nothing in them', () => {
    const tree = buildGroupTree([blogPost])
    expect(tree.map((group) => group.path)).toEqual([['Content']])
    expect(tree[0].list).toEqual([])
    expect(groupItems(tree[0])).toEqual([blogPost])
  })

  it('tells a group that holds the open resource from the one that lists it', () => {
    const [content] = buildGroupTree([blogPost, page])
    const blog = content.groups[0]
    expect(groupHoldsItem(content, blogPost)).toBe(true)
    expect(groupOwnsItem(content, blogPost)).toBe(false)
    expect(groupHoldsItem(blog, blogPost)).toBe(true)
    expect(groupOwnsItem(blog, blogPost)).toBe(true)
    expect(groupHoldsItem(blog, page)).toBe(false)
    expect(groupOwnsItem(content, page)).toBe(true)
  })

  it('names a group for its icon: its own name, or the names down to it for a group inside another', () => {
    const [content] = buildGroupTree([deep])
    expect(groupMenuName(content)).toBe('Content')
    expect(groupMenuName(content.groups[0])).toBe('Content / Blog')
    expect(groupMenuName(content.groups[0].groups[0])).toBe('Content / Blog / Private')
    expect(groupMenuName({ name: { enUS: 'Shop' } })).toBe('Shop')
  })

  it('gives a sub-group a key of its own', () => {
    const [content] = buildGroupTree([blogPost])
    expect(groupKey(content)).toBe('content')
    expect(groupKey(content.groups[0])).toBe('content--blog')
  })

  it('finds the groups from the top one down to the one that lists the resource', () => {
    const tree = buildGroupTree([blogPost, page])
    expect(groupTrail(tree, blogPost).map((group) => group.path)).toEqual([['Content'], ['Content', 'Blog']])
    expect(groupTrail(tree, page).map((group) => group.path)).toEqual([['Content']])
    expect(groupTrail(tree, item('other'))).toEqual([])
    expect(groupOf(tree, blogPost).path).toEqual(['Content', 'Blog'])
    expect(groupOf(tree, page).path).toEqual(['Content'])
    expect(groupOf(tree, item('other', 'Nowhere'))).toBeUndefined()
  })

  it('orders the groups inside a group too, and lists rows top down', () => {
    const tree = buildGroupTree([item('a', ['Top', 'Zed']), item('b', ['Top', 'Alpha']), item('c', 'Top')])
    const ordered = orderGroups(tree, (name) => name, 'enUS')
    expect(ordered[0].groups.map((group) => group.name)).toEqual(['Alpha', 'Zed'])
    expect(groupRows(ordered[0]).map((row) => [row.group.name, row.depth, row.parents.length])).toEqual([['Top', 0, 0], ['Alpha', 1, 1], ['Zed', 1, 1]])
  })
})
