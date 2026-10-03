// One spec per screenshot of docs/ui that the README and the documentation show: the list, the form, the table, the sidebar rail
// and the form controls of the design-system page, in the theme and the window size their file name says.
const specs = []
const add = (name, viewport, run, options = {}) => specs.push({ name, resource: options.resource || null, run, options: { viewport, ...options } })

const D1280 = { width: 1280, height: 720 }
const D1500 = { width: 1500, height: 900 }

const listItem = (c, text) => c.page.locator('.record-list .item').filter({ hasText: text }).first()
const hoverItem = async (c, text) => {
  await listItem(c, text).hover()
  await c.page.waitForTimeout(400)
}

add('form-light-1280x720', D1280, async (c) => {
  await c.visit('text_formats', { viewport: D1280 })
  await listItem(c, 'Contact card').click()
  await c.page.waitForTimeout(1200)
  await c.snap('form-light-1280x720')
})
add('list-light-1280x720', D1280, async (c) => {
  await c.visit('text_formats', { viewport: D1280 })
  await listItem(c, 'Contact card').click()
  await c.page.waitForTimeout(1000)
  await hoverItem(c, 'Printer')
  await c.snap('list-light-1280x720')
})
add('list-compact-dark-1280x720', D1280, async (c) => {
  await c.visit('text_formats', { viewport: D1280, theme: 'dark' })
  await listItem(c, 'Contact card').click()
  await c.page.waitForTimeout(800)
  await c.page.locator('.density-btn').click()
  await c.page.waitForTimeout(500)
  await hoverItem(c, 'Printer')
  await c.snap('list-compact-dark-1280x720')
})
const tableShot = (name, viewport, theme) => add(name, viewport, async (c) => {
  await c.visit('table_view', { viewport, theme })
  await c.page.waitForTimeout(800)
  if (viewport.width > 500) await c.page.locator('tbody tr, [role=row]').nth(3).hover().catch(() => {})
  await c.page.waitForTimeout(400)
  await c.snap(name)
})
tableShot('table-light-1500x900', D1500, 'light')
tableShot('table-dark-1280x720', D1280, 'dark')
tableShot('table-phone-light', { width: 390, height: 844 }, 'light')

// the sidebar as a rail: a badge per group, and the flyout of the group of the current resource
const railFlyout = async (c, name, viewport, theme) => {
  await c.visit('text_formats', { viewport, theme })
  if (viewport.width >= 1280) {
    await c.page.locator('button.nav-tool[aria-label="Collapse sidebar"], button[aria-label="Collapse sidebar"]').first().click()
    await c.page.waitForTimeout(500)
  }
  const badge = c.page.locator('.nav-rail button, nav button').filter({ hasText: /^TE$/ }).first()
  await badge.hover()
  await c.page.waitForTimeout(700)
  await c.snap(name)
}
add('rail-flyout-light-1500x900', D1500, (c) => railFlyout(c, 'rail-flyout-light-1500x900', D1500, 'light'))
add('rail-tablet-dark', { width: 1000, height: 720 }, (c) => railFlyout(c, 'rail-tablet-dark', { width: 1000, height: 720 }, 'dark'))
add('rail-phone-drawer-light', { width: 390, height: 844 }, async (c) => {
  await c.visit('table_view', { viewport: { width: 390, height: 844 } })
  await c.page.locator('button[aria-label="Toggle navigation menu"]').click()
  await c.page.waitForTimeout(700)
  await c.snap('rail-phone-drawer-light')
})

// the "Form controls" card of the design-system page
for (const theme of ['light', 'dark']) {
  add(`ds-forms-${theme}`, { width: 1500, height: 1600 }, async (c) => {
    await c.visit('design-system', { viewport: { width: 1500, height: 1600 }, theme })
    const card = c.page.locator('section.ds-section').filter({ has: c.page.locator('#ds-forms') })
    await card.scrollIntoViewIfNeeded()
    await c.page.waitForTimeout(500)
    await card.screenshot({ path: `${c.outDir}/ds-forms-${theme}.png` })
  })
}

// the dynamic layout: blocks of one paragraph field side by side, 2 by 2, 3 by 3 and mixed sizes
for (const [name, field] of [['layout-2x2-light', 'twoByTwo'], ['layout-3x3-light', 'threeByThree'], ['layout-4x2-light', 'fourByTwo'], ['layout-mixed-light', 'mixed']]) {
  add(name, { width: 1280, height: 1800 }, (c) => c.field(field), { resource: 'structured_grid', record: (seeded) => seeded.grid, scroll: 'nearest', crop: { width: 0, pad: { l: 8, r: 8, t: 8, b: 8 } } })
}

// the form layout: the fields of a resource in lines, one, two, three and four slots wide
add('form-layout-light', { width: 1280, height: 1000 }, async (c) => {
  await c.page.locator('.record-editor-form .field-wrapper[data-model="reference"]').first().waitFor()
  await c.page.waitForTimeout(800)
  await c.page.locator('.record-editor-form').screenshot({ path: `${c.outDir}/form-layout-light.png` })
}, { resource: 'structured_layout', record: (seeded) => seeded.layout })

module.exports = { specs }
