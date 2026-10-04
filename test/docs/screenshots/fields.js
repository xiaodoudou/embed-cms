// One spec per screenshot of docs/reference/fields/img: the file name, the resource, and the steps that bring the form to the
// state the page describes. A spec returns what to crop (a locator or a list of them, the crop is their union, 650px wide) or
// takes the picture itself and returns nothing. Specs for the same page sit together; `ctx` comes from lib.js.
const specs = []
const add = (name, resource, run, options = {}) => specs.push({ name, resource, run, options })

/** Fills the required `name` field (most catalogue resources require one) so the field under test is the only one missing */
const named = async (c, model = 'name') => {
  if ((await c.field(model).count()) === 0) return
  await c.type(model, 'Name')
}
/** Clicks Create and answers the field, to show its error */
const refuse = async (c, model) => {
  await c.create()
  return c.field(model)
}
/** Types a value and leaves the field, so its rule is checked */
const typed = async (c, model, value) => {
  await c.type(model, value)
  await c.blur()
  return c.field(model)
}
const toast = (c) => c.page.locator('.v-snackbar__wrapper, .toast, .cms-toast').first()

// ---------------------------------------------------------------- string
add('string-default', 'text_strings', (c) => [c.field('optional.enUS'), c.field('sharedValue')])
add('string-default-dark', 'text_strings', (c) => [c.field('optional.enUS'), c.field('sharedValue')], { theme: 'dark' })
add('string-localised-zhCN', 'text_strings', (c) => [c.field('optional.zhCN'), c.field('sharedValue')], { locale: 'zhCN' })
add('string-required-error', 'text_strings', (c) => refuse(c, 'name.enUS'))
add('string-required-error-dark', 'text_strings', (c) => refuse(c, 'name.enUS'), { theme: 'dark' })
add('string-unique-required-error', 'text_strings', async (c) => {
  await c.type('name.enUS', 'Name')
  await c.locale('zhCN')
  await c.type('name.zhCN', '名称')
  await c.locale('enUS')
  return refuse(c, 'uniqueCode')
})
add('string-unique-duplicate', 'text_strings', async (c) => {
  await c.type('name.enUS', 'Second')
  await c.locale('zhCN')
  await c.type('name.zhCN', '第二')
  await c.type('uniqueCode', 'A1')
  await c.create()
  await c.page.waitForTimeout(500)
  return toast(c)
}, { toast: true })
add('string-limited', 'text_strings', (c) => c.field('limited'))
add('string-limited-short', 'text_strings', (c) => typed(c, 'limited', 'ab'))
add('string-limited-error', 'text_strings', (c) => typed(c, 'limited', 'abcdefghijklmnopqrstuvwxyz'))
add('string-pattern', 'text_strings', (c) => c.field('pattern'))
add('string-pattern-error', 'text_strings', (c) => typed(c, 'pattern', 'abc'))
add('string-pattern-per-locale-error', 'text_strings', (c) => typed(c, 'patternPerLocale.enUS', 'ABC'))
add('string-pattern-per-locale-zhCN-error', 'text_strings', async (c) => {
  await c.locale('zhCN')
  return typed(c, 'patternPerLocale.zhCN', 'hello')
})
add('string-mask', 'text_strings', (c) => [c.field('maskPhone'), c.field('maskPlate')])
add('string-mask-filled', 'text_strings', async (c) => {
  await c.type('maskPhone', '5551234567')
  await c.type('maskPlate', 'ab12')
  await c.blur()
  return [c.field('maskPhone'), c.field('maskPlate')]
})
add('string-readonly', 'text_strings', (c) => c.field('readOnly'))
add('string-disabled', 'text_strings', (c) => c.field('disabled'))

// ---------------------------------------------------------------- transliterate
add('transliterate-slug', 'text_strings', async (c) => {
  await typed(c, 'name.enUS', 'Héllo Wörld 你好!')
  return c.field('slug')
})
add('transliterate-locked', 'text_strings', async (c) => {
  await typed(c, 'name.enUS', 'Héllo Wörld 你好!')
  return c.field('lockedSlug')
})

// ---------------------------------------------------------------- text
add('text-default', 'text_long', (c) => c.field('text.enUS'))
add('text-required-error', 'text_long', async (c) => {
  await c.type('title', 'Title')
  return refuse(c, 'requiredText.enUS')
})
add('text-limited', 'text_long', (c) => c.field('limitedText'))
add('text-limited-error', 'text_long', (c) => typed(c, 'limitedText', 'x'.repeat(200)))
add('text-readonly', 'text_long', (c) => c.field('readOnlyText'))
add('text-disabled', 'text_long', (c) => c.field('disabledText'))

// ---------------------------------------------------------------- email, url, password
add('email-default', 'text_formats', (c) => c.field('email'))
add('email-invalid', 'text_formats', (c) => typed(c, 'email', 'not-an-email'))
add('email-required-error', 'text_formats', async (c) => {
  await named(c)
  return refuse(c, 'requiredEmail')
})
add('email-readonly', 'text_formats', (c) => c.field('readOnlyEmail'))
add('url-default', 'text_formats', (c) => c.field('url'))
add('url-invalid', 'text_formats', (c) => typed(c, 'url', 'example.com'))
add('url-empty-valid', 'text_formats', async (c) => {
  await c.type('url', 'https://example.com')
  await c.input('url').fill('')
  await c.blur()
  return c.field('url')
})
add('url-required-error', 'text_formats', async (c) => {
  await named(c)
  return refuse(c, 'requiredUrl')
})
add('url-localised', 'text_formats', (c) => c.field('localisedUrl.enUS'))
add('url-disabled', 'text_formats', (c) => c.field('disabledUrl'))
add('password-default', 'text_formats', (c) => c.field('password'))
add('password-typed', 'text_formats', (c) => typed(c, 'password', 'secret123'))
add('password-required-error', 'text_formats', async (c) => {
  await named(c)
  return refuse(c, 'requiredPassword')
})

// ---------------------------------------------------------------- number, integer, double
add('number-default', 'numbers', (c) => [c.field('number'), c.field('requiredNumber')])
add('number-required-error', 'numbers', async (c) => {
  await named(c)
  return refuse(c, 'requiredNumber')
})
add('number-localised', 'numbers', (c) => c.field('localisedNumber.enUS'))
add('number-unique', 'numbers', (c) => c.field('uniqueNumber'))
add('number-unique-duplicate', 'numbers', async (c) => {
  await c.type('name', 'Second')
  await c.type('requiredNumber', '1')
  await c.type('boundedInteger', '10')
  await c.type('uniqueNumber', '42')
  await c.create()
  await c.page.waitForTimeout(500)
  return toast(c)
}, { toast: true })
add('number-readonly', 'numbers', (c) => c.field('readOnlyNumber'))
add('number-disabled', 'numbers', (c) => c.field('disabledNumber'))
add('integer-default', 'numbers', (c) => c.field('integer'))
add('integer-invalid', 'numbers', (c) => typed(c, 'integer', '3.5'))
add('integer-bounded', 'numbers', (c) => c.field('boundedInteger'))
add('integer-required-error', 'numbers', async (c) => {
  await named(c)
  return refuse(c, 'boundedInteger')
})
add('integer-bounded-big', 'numbers', (c) => typed(c, 'boundedInteger', '150'))
add('integer-bounded-small', 'numbers', (c) => typed(c, 'boundedInteger', '-5'))
add('double-default', 'numbers', (c) => c.field('double'))
add('double-bounded', 'numbers', (c) => c.field('boundedDouble'))
add('double-bounded-big', 'numbers', (c) => typed(c, 'boundedDouble', '5.5'))

// ---------------------------------------------------------------- date, time, datetime
/** Types a value in a date, time or datetime field and validates it with Enter */
const entered = async (c, model, value) => {
  await c.input(model).click()
  await c.input(model).fill(value)
  await c.input(model).press('Enter')
  await c.page.keyboard.press('Escape')
  await c.blur()
}
add('date-default', 'dates', (c) => [c.field('date'), c.field('requiredDate')])
add('date-picker', 'dates', async (c) => {
  await c.input('date').click()
  await c.page.waitForSelector('.dp--menu', { state: 'visible' })
  await c.page.waitForTimeout(300)
  return c.field('date')
}, { crop: { height: 420 } })
add('date-filled', 'dates', async (c) => {
  await entered(c, 'date', '2026-03-15')
  await entered(c, 'requiredDate', '2026-04-01')
  return [c.field('date'), c.field('requiredDate')]
})
add('date-required-error', 'dates', async (c) => {
  await named(c)
  return refuse(c, 'requiredDate')
})
add('required-toast', 'dates', async (c) => {
  await named(c)
  await c.create()
  await c.page.waitForTimeout(300)
  return toast(c)
}, { toast: true, crop: { width: 0, pad: { l: 10, r: 10, t: 10, b: 10 } } })
add('date-localised', 'dates', (c) => c.field('localisedDate.enUS'))
add('date-disabled', 'dates', (c) => c.field('disabledDate'))
add('datetime-default', 'dates', (c) => c.field('datetime'))
add('datetime-picker', 'dates', async (c) => {
  await c.input('datetime').click()
  await c.page.waitForSelector('.dp--menu', { state: 'visible' })
  await c.page.waitForTimeout(300)
  return c.field('datetime')
}, { crop: { height: 520 } })
add('datetime-filled', 'dates', async (c) => {
  await entered(c, 'datetime', '2026-05-06 07:08:09')
  await entered(c, 'requiredDatetime', '2026-09-29 16:48:51')
  return [c.field('datetime'), c.field('requiredDatetime')]
})
add('datetime-readonly', 'dates', (c) => c.field('readOnlyDatetime'))
add('datetime-required-error', 'dates', async (c) => {
  await named(c)
  return refuse(c, 'requiredDatetime')
})
add('time-default', 'dates', (c) => [c.field('time'), c.field('requiredTime')])
add('time-picker', 'dates', async (c) => {
  await c.input('time').click()
  await c.page.waitForSelector('.dp--menu', { state: 'visible' })
  await c.page.waitForTimeout(300)
  return c.field('time')
}, { crop: { height: 400 } })
add('time-filled', 'dates', async (c) => {
  await entered(c, 'time', '14:30:15')
  await entered(c, 'requiredTime', '17:22:43')
  return [c.field('time'), c.field('requiredTime')]
})
add('time-required-error', 'dates', async (c) => {
  await named(c)
  return refuse(c, 'requiredTime')
})

// ---------------------------------------------------------------- checkbox
add('checkbox-default', 'choice_boolean', (c) => c.field('flag'))
add('checkbox-on', 'choice_boolean', async (c) => {
  await c.field('flag').locator('[role=switch], .v-switch, label, input').first().click()
  await c.blur()
  return c.field('flag')
})
add('checkbox-required', 'choice_boolean', (c) => c.field('requiredFlag'))
add('checkbox-localised', 'choice_boolean', (c) => c.field('localisedFlag.enUS'))
add('checkbox-readonly', 'choice_boolean', (c) => c.field('readOnlyFlag'))
add('checkbox-disabled', 'choice_boolean', (c) => c.field('disabledFlag'))

// ---------------------------------------------------------------- color
const canvas = (c, model) => c.field(model).locator('.v-color-picker-canvas')
add('color-default', 'choice_color', (c) => c.field('color'))
add('color-picked', 'choice_color', async (c) => {
  const box = await canvas(c, 'color').boundingBox()
  await c.page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.13)
  await c.blur()
  return c.field('color')
})
add('color-required', 'choice_color', (c) => c.field('requiredColor'))
add('color-required-error', 'choice_color', async (c) => {
  await named(c)
  return refuse(c, 'requiredColor')
})
add('color-localised', 'choice_color', (c) => c.field('localisedColor.enUS'))
add('color-swatch', 'choice_color', (c) => c.field('swatch'))
add('color-swatch-picked', 'choice_color', async (c) => {
  const slider = c.field('swatch').locator('.v-slider').first()
  const box = await slider.boundingBox()
  await c.page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2)
  await c.blur()
  return c.field('swatch')
})
add('color-readonly', 'choice_color', (c) => c.field('readOnlyColor'))
add('color-disabled', 'choice_color', (c) => c.field('disabledColor'))

// ---------------------------------------------------------------- select
const openList = async (c, model) => {
  await c.field(model).locator('.v-field').first().click()
  await c.page.mouse.move(5, 5)
  await c.page.waitForSelector('.v-overlay-container .v-list-item', { state: 'visible' })
  await c.page.waitForTimeout(350)
}
const chooseItem = async (c, text) => {
  await c.page.locator('.v-overlay-container .v-list-item').filter({ hasText: text }).first().click()
  await c.page.waitForTimeout(250)
}
/** Chooses `text` in the select `model` */
const pick = async (c, model, text) => {
  await openList(c, model)
  await chooseItem(c, text)
  await c.page.keyboard.press('Escape')
  await c.blur()
}
add('select-default', 'choice_select', (c) => c.field('status'))
add('select-open', 'choice_select', async (c) => {
  await openList(c, 'status')
  return c.field('status')
}, { crop: { height: 260 }, scroll: 'start' })
add('select-open-dark', 'choice_select', async (c) => {
  await openList(c, 'status')
  return c.field('status')
}, { crop: { height: 260 }, scroll: 'start', theme: 'dark' })
add('select-required-error', 'choice_select', async (c) => {
  await named(c)
  return refuse(c, 'requiredStatus')
})
add('select-labels-open', 'choice_select', async (c) => {
  await openList(c, 'priority')
  return c.field('priority')
}, { crop: { height: 260 }, scroll: 'start' })
add('select-filled-labels', 'choice_select', async (c) => {
  await pick(c, 'priority', 'High')
  await pick(c, 'item', 'Beta')
  return [c.field('priority'), c.field('item')]
})
add('select-resource-open', 'choice_select', async (c) => {
  await openList(c, 'item')
  return c.field('item')
}, { crop: { height: 300 }, scroll: 'start' })
add('select-custom-label-open', 'choice_select', async (c) => {
  await openList(c, 'itemWithLabel')
  return c.field('itemWithLabel')
}, { crop: { height: 300 }, scroll: 'start' })
add('select-filled-custom-label', 'choice_select', async (c) => {
  await pick(c, 'itemWithLabel', 'Gamma')
  return c.field('itemWithLabel')
})
add('select-sources-open', 'choice_select', async (c) => {
  await openList(c, 'linked')
  return c.field('linked')
}, { crop: { height: 380 }, scroll: 'start' })
add('select-sources-filled', 'choice_select', async (c) => {
  await pick(c, 'linked', 'Ann')
  return c.field('linked')
})
add('select-localised', 'choice_select', (c) => c.field('localisedChoice.enUS'))
add('select-readonly', 'choice_select', (c) => c.field('readOnlySelect'))
add('select-disabled', 'choice_select', (c) => c.field('disabledSelect'))

// ---------------------------------------------------------------- multiselect
/** Chooses each of `texts` in the multiselect `model` and closes the list */
const pickMany = async (c, model, texts) => {
  await openList(c, model)
  for (const text of texts) await chooseItem(c, text)
  await c.page.keyboard.press('Escape')
  await c.blur()
}
add('multiselect-default', 'choice_multi', (c) => c.field('flags'))
add('multiselect-open', 'choice_multi', async (c) => {
  await openList(c, 'flags')
  return c.field('flags')
}, { crop: { height: 260 }, scroll: 'start' })
add('multiselect-filled', 'choice_multi', async (c) => {
  await pickMany(c, 'flags', ['red', 'blue'])
  return c.field('flags')
})
add('multiselect-required-error', 'choice_multi', async (c) => {
  await named(c)
  return refuse(c, 'requiredFlags')
})
add('multiselect-labels', 'choice_multi', (c) => c.field('channels'))
add('multiselect-resource-open', 'choice_multi', async (c) => {
  await openList(c, 'items')
  return c.field('items')
}, { crop: { height: 320 }, scroll: 'start' })
add('multiselect-filled-labels', 'choice_multi', async (c) => {
  await pickMany(c, 'channels', ['Website', 'Print'])
  await pickMany(c, 'items', ['Alpha', 'Gamma'])
  return [c.field('channels'), c.field('items')]
})
add('multiselect-sources-open', 'choice_multi', async (c) => {
  await openList(c, 'linkedMany')
  return c.field('linkedMany')
}, { crop: { height: 380 }, scroll: 'start' })
add('multiselect-sources-filled', 'choice_multi', async (c) => {
  await pickMany(c, 'linkedMany', ['Alpha', 'Ann', 'Gamma'])
  return c.field('linkedMany')
})
add('multiselect-localised-enUS', 'choice_multi', async (c) => {
  await pickMany(c, 'localisedItems.enUS', ['Beta'])
  return c.field('localisedItems.enUS')
})
add('multiselect-localised-zhCN', 'choice_multi', async (c) => {
  await c.locale('zhCN')
  await pickMany(c, 'localisedItems.zhCN', ['贝塔'])
  return c.field('localisedItems.zhCN')
})
add('multiselect-readonly', 'choice_multi', (c) => c.field('readOnlyItems'))
add('multiselect-disabled', 'choice_multi', (c) => c.field('disabledItems'))

// ---------------------------------------------------------------- pillbox
/** Adds each of `tags` to the pillbox `model` (type, Enter) and leaves the field */
const tag = async (c, model, tags) => {
  await c.input(model).click()
  for (const text of tags) {
    await c.page.keyboard.type(text)
    await c.page.keyboard.press('Enter')
  }
  await c.blur()
  return c.field(model)
}
add('pillbox-default', 'choice_multi', (c) => c.field('tags'))
add('pillbox-filled', 'choice_multi', (c) => tag(c, 'tags', ['news', 'sport', 'a', 'b']))
add('pillbox-required', 'choice_multi', (c) => c.field('requiredTags'))
add('pillbox-required-error', 'choice_multi', async (c) => {
  await named(c)
  return refuse(c, 'requiredTags')
})
add('pillbox-localised', 'choice_multi', (c) => c.field('localisedTags.enUS'))
add('pillbox-bounded', 'choice_multi', (c) => c.field('boundedTags'))
add('pillbox-bounded-one', 'choice_multi', (c) => tag(c, 'boundedTags', ['one']))
add('pillbox-bounded-ok', 'choice_multi', (c) => tag(c, 'boundedTags', ['one', 'two']))
add('pillbox-bounded-many', 'choice_multi', (c) => tag(c, 'boundedTags', ['one', 'two', 'three', 'four', 'five']))

// ---------------------------------------------------------------- code
add('code-default', 'text_long', (c) => c.field('snippet'))
add('code-typed', 'text_long', async (c) => {
  await c.field('snippet').locator('.CodeMirror').click()
  await c.page.keyboard.type('const a = 1;\nfunction f() { return "x" }')
  await c.blur()
  return c.field('snippet')
})
add('code-height', 'text_long', (c) => c.field('sizedSnippet'))

// ---------------------------------------------------------------- wysiwyg
add('wysiwyg-default', 'text_long', (c) => c.field('body.enUS'))
add('wysiwyg-default-dark', 'text_long', (c) => c.field('body.enUS'), { theme: 'dark' })
add('wysiwyg-basic', 'text_long', (c) => c.field('basicBody'))
add('wysiwyg-disabled', 'text_long', (c) => c.field('disabledBody'))
add('wysiwyg-required-error', 'text_long', async (c) => {
  const editor = c.field('requiredBody.enUS').locator('[contenteditable=true]').first()
  await editor.click()
  await c.page.keyboard.type('x')
  await c.page.keyboard.press('Backspace')
  await c.blur()
  return c.field('requiredBody.enUS')
})
add('wysiwyg-required-untouched-error', 'text_long', async (c) => {
  await c.type('title', 'Title')
  await c.create()
  return c.field('requiredBody.enUS')
})

// ---------------------------------------------------------------- the page on required fields (FIELDS.md)
add('required-toast-locale', 'text_long', async (c) => {
  await c.type('title', 'Title')
  await c.create()
  await c.page.waitForTimeout(300)
  return toast(c)
}, { toast: true })
add('locale-tab-badges', 'text_long', async (c) => {
  await c.type('title', 'Title')
  await c.create()
  await c.page.waitForTimeout(500)
  return c.page.locator('.record-editor .top-bar').first()
}, { crop: { width: 0, height: 72, pad: { t: 0, b: 0, l: 0, r: 0 }, clipWidth: 676 }, scroll: 'none' })

// ---------------------------------------------------------------- file and image
/** Gives `names` (fixture files) to the file field `model`, as a choice in the file dialog would, and waits for the previews */
const attach = async (c, model, names) => {
  for (const name of names) {
    await c.field(model).locator('input[type=file]').setInputFiles(c.files[name])
    await c.page.waitForTimeout(900)
  }
  await c.blur()
  return c.field(model)
}
const saved = (resource, key) => ({ record: (seeded) => seeded[key] })
/** The field of a record that was just opened: its first input has the focus, which would show the placeholder over the label */
const opened = async (c, model) => {
  await c.blur()
  return c.field(model)
}

add('file-default', 'media_files', (c) => c.field('attachments'))
add('file-multiple-filled', 'media_files', (c) => attach(c, 'attachments', ['man.jpg', 'note.txt']))
add('file-single', 'media_files', (c) => c.field('contract'))
add('file-required-error', 'media_files', async (c) => {
  await named(c)
  await refuse(c, 'contract')
  return opened(c, 'contract')
})
add('file-single-filled', 'media_files', (c) => attach(c, 'contract', ['manual.pdf']))
add('file-accept', 'media_files', (c) => c.field('manual'))
add('file-accept-error', 'media_files', (c) => attach(c, 'manual', ['note.txt']))
add('file-media', 'media_files', (c) => c.field('media'))
add('file-media-error', 'media_files', (c) => attach(c, 'media', ['note.txt']))
add('file-limit', 'media_files', (c) => c.field('small'))
add('file-limit-error', 'media_files', (c) => attach(c, 'small', ['big.txt']))
add('file-limit-ok', 'media_files', (c) => attach(c, 'small', ['note.txt']))
add('file-localised', 'media_files', (c) => c.field('localisedBrochure.enUS'))
add('file-readonly', 'media_files', (c) => c.field('readOnlyFile'))
add('file-readonly-saved', 'media_files', (c) => opened(c, 'readOnlyFile'), saved('media_files', 'files'))
add('file-disabled', 'media_files', (c) => c.field('disabledFile'))
add('file-disabled-saved', 'media_files', (c) => opened(c, 'disabledFile'), saved('media_files', 'files'))

add('image-default', 'media_images', (c) => c.field('gallery'))
add('image-multiple-filled', 'media_images', (c) => attach(c, 'gallery', ['man.jpg', 'icon.svg']))
add('image-multiple-saved', 'media_images', (c) => opened(c, 'gallery'), saved('media_images', 'images'))
add('image-single', 'media_images', (c) => c.field('cover'))
add('image-required-error', 'media_images', async (c) => {
  await named(c)
  await refuse(c, 'cover')
  return opened(c, 'cover')
})
add('image-single-filled', 'media_images', (c) => attach(c, 'cover', ['man.jpg']))
add('image-accept', 'media_images', (c) => c.field('icon'))
add('image-accept-error', 'media_images', (c) => attach(c, 'icon', ['man.jpg']))
add('image-accept-filled', 'media_images', (c) => attach(c, 'icon', ['icon.svg']))
add('image-limit', 'media_images', (c) => c.field('photo'))
add('image-limit-error', 'media_images', (c) => attach(c, 'photo', ['big.jpg']))
add('image-limit-ok', 'media_images', (c) => attach(c, 'photo', ['man.jpg']))
add('image-localised', 'media_images', (c) => c.field('localisedBanner.enUS'))
add('image-localised-saved', 'media_images', async (c) => {
  await c.type('name', 'Banner')
  await attach(c, 'localisedBanner.enUS', ['man.jpg'])
  await c.create()
  await c.page.waitForTimeout(1500)
  return c.field('localisedBanner.enUS')
})
add('image-localised-zhCN', 'media_images', (c) => c.field('localisedBanner.zhCN'), { locale: 'zhCN' })
add('image-readonly', 'media_images', (c) => c.field('readOnlyImage'))
add('image-readonly-saved', 'media_images', (c) => opened(c, 'readOnlyImage'), saved('media_images', 'images'))
add('image-disabled', 'media_images', (c) => c.field('disabledImage'))
add('image-disabled-saved', 'media_images', (c) => opened(c, 'disabledImage'), saved('media_images', 'images'))

// ---------------------------------------------------------------- cropimage and imagemap (the tools open in a modal: its card is the picture)
/** Opens the tool of a crop or image map field (the button under its picture), waits for the picture to load, and answers the card of the modal */
const tool = async (c, model, button, card) => {
  await c.field(model).locator(button).click()
  await c.page.waitForSelector(card, { timeout: 15000 })
  await c.page.waitForTimeout(2500)
  return c.page.locator(card)
}
const MODAL = { crop: { width: 0, pad: { l: 0, r: 0, t: 0, b: 0 } }, scroll: 'none' }
/** Selects the n-th area of the list of the map tool */
const pickArea = async (c, n) => {
  await c.page.locator('.map-pick').nth(n).click()
  await c.page.waitForTimeout(600)
}

add('cropimage-default', 'media_crop', (c) => c.field('photo'))
add('cropimage-filled', 'media_crop', (c) => attach(c, 'photo', ['man.jpg']))
add('cropimage-dialog', 'media_crop', async (c) => {
  await attach(c, 'photo', ['man.jpg'])
  return tool(c, 'photo', '.edit-crop', '.crop-card')
}, MODAL)
add('cropimage-dialog-dark', 'media_crop', async (c) => {
  await attach(c, 'photo', ['man.jpg'])
  return tool(c, 'photo', '.edit-crop', '.crop-card')
}, { ...MODAL, theme: 'dark' })
add('cropimage-dialog-ratio', 'media_crop', async (c) => {
  await attach(c, 'photo', ['man.jpg'])
  const card = await tool(c, 'photo', '.edit-crop', '.crop-card')
  await c.page.locator('.crop-ratio', { hasText: '16:9' }).click()
  await c.page.waitForTimeout(900)
  return card
}, MODAL)
add('cropimage-avatar', 'media_crop', async (c) => {
  await attach(c, 'avatar', ['man.jpg'])
  return tool(c, 'avatar', '.edit-crop', '.crop-card')
}, MODAL)
add('cropimage-banner', 'media_crop', async (c) => {
  await attach(c, 'banner', ['man.jpg'])
  return tool(c, 'banner', '.edit-crop', '.crop-card')
}, MODAL)
add('cropimage-cropped', 'media_crop', async (c) => {
  await attach(c, 'photo', ['man.jpg'])
  await tool(c, 'photo', '.edit-crop', '.crop-card')
  await c.page.locator('.crop-ratio', { hasText: '1:1' }).click()
  await c.page.waitForTimeout(800)
  await c.page.locator('.crop-apply').click()
  await c.page.waitForTimeout(1200)
  await c.blur()
  return c.field('photo')
})
add('cropimage-saved', 'media_crop', async (c) => {
  await c.blur()
  return [c.field('photo'), c.field('avatar')]
  // a tall window: both fields are in the picture, whole
}, { ...saved('media_crop', 'cropped'), viewport: { width: 1280, height: 1100 } })

add('imagemap-default', 'media_map', (c) => c.field('floorPlan'))
add('imagemap-filled', 'media_map', (c) => attach(c, 'floorPlan', ['man.jpg']))
add('imagemap-draw', 'media_map', async (c) => {
  await attach(c, 'floorPlan', ['man.jpg'])
  const card = await tool(c, 'floorPlan', '.edit-map', '.map-card')
  const box = await c.page.locator('.map-overlay').boundingBox()
  const at = (x, y) => [box.x + box.width * x, box.y + box.height * y]
  const drag = async (from, to) => {
    await c.page.mouse.move(...at(...from))
    await c.page.mouse.down()
    await c.page.mouse.move(...at(...to), { steps: 8 })
    await c.page.mouse.up()
    await c.page.waitForTimeout(400)
  }
  await c.page.locator('.map-tool-circle').click()
  await drag([0.333, 0.458], [0.333 + 0.14, 0.458])
  await c.page.locator('input[name=map-title]').fill('Lamp')
  await c.page.locator('input[name=map-href]').fill('https://example.com/lamp')
  await c.page.locator('.map-tool-rect').click()
  await drag([0.6, 0.5], [0.9, 0.88])
  await c.page.locator('input[name=map-title]').fill('Kitchen')
  await c.page.locator('input[name=map-href]').fill('/kitchen')
  await c.page.waitForTimeout(500)
  return card
}, MODAL)
add('imagemap-saved', 'media_map', async (c) => {
  await c.blur()
  return c.field('floorPlan')
}, saved('media_map', 'maps'))
add('imagemap-dialog', 'media_map', async (c) => {
  const card = await tool(c, 'floorPlan', '.edit-map', '.map-card')
  await pickArea(c, 1)
  return card
}, { ...MODAL, ...saved('media_map', 'maps') })
add('imagemap-dialog-dark', 'media_map', async (c) => {
  const card = await tool(c, 'floorPlan', '.edit-map', '.map-card')
  await pickArea(c, 1)
  return card
}, { ...MODAL, ...saved('media_map', 'maps'), theme: 'dark' })
add('imagemap-record', 'media_map', async (c) => {
  const card = await tool(c, 'catalogue', '.edit-map', '.map-card')
  await pickArea(c, 0)
  return card
}, { ...MODAL, ...saved('media_map', 'maps') })
add('imagemap-record-only', 'media_map', async (c) => {
  const card = await tool(c, 'productMap', '.edit-map', '.map-card')
  await pickArea(c, 0)
  return card
}, { ...MODAL, ...saved('media_map', 'maps') })
add('imagemap-value', 'media_map', async (c) => {
  const card = await tool(c, 'roomMap', '.edit-map', '.map-card')
  await pickArea(c, 0)
  return card
}, { ...MODAL, ...saved('media_map', 'maps') })
add('imagemap-everything', 'media_map', async (c) => {
  const card = await tool(c, 'everything', '.edit-map', '.map-card')
  await pickArea(c, 1)
  return card
}, { ...MODAL, ...saved('media_map', 'maps') })

// ---------------------------------------------------------------- json
add('json-default', 'structured_data', (c) => c.field('json'))
add('json-localised', 'structured_data', (c) => c.field('localisedJson.enUS'))
add('json-value', 'structured_data', (c) => c.field('json'), saved('structured_data', 'json'))
add('json-localised-zhCN', 'structured_data', (c) => c.field('localisedJson.zhCN'), { ...saved('structured_data', 'json'), locale: 'zhCN' })

// ---------------------------------------------------------------- object
/** Sets a value of a json-editor form (`name` is the name of its input, `root[title]`) */
const setValue = async (c, model, name, value) => {
  const input = c.field(model).locator(`[name="${name}"]`)
  if ((await input.evaluate((element) => element.tagName)) === 'SELECT') {
    await input.evaluate((element, wanted) => {
      element.value = wanted
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }, value)
  } else {
    await input.fill(value)
  }
}
add('object-default', 'structured_data', (c) => c.field('settings'))
add('object-settings-filled', 'structured_data', async (c) => {
  await setValue(c, 'settings', 'root[title]', 'Spring sale')
  await setValue(c, 'settings', 'root[count]', '5')
  await setValue(c, 'settings', 'root[mode]', 'fast')
  await c.blur()
  return c.field('settings')
})
add('object-table', 'structured_data', (c) => c.field('rows'))
add('object-table-filled', 'structured_data', async (c) => {
  const add = c.field('rows').getByRole('button', { name: 'Add row' })
  await add.click()
  await add.click()
  await c.page.waitForTimeout(400)
  await setValue(c, 'rows', 'root[0][label]', 'Chairs')
  await setValue(c, 'rows', 'root[0][kind]', 'a')
  await setValue(c, 'rows', 'root[0][amount]', '12')
  await setValue(c, 'rows', 'root[1][label]', 'Lamps')
  await setValue(c, 'rows', 'root[1][kind]', 'b')
  await setValue(c, 'rows', 'root[1][amount]', '4')
  await c.blur()
  return c.field('rows')
})
add('object-localised', 'structured_data', async (c) => {
  await setValue(c, 'localisedObject.enUS', 'root[label]', 'Spring sale')
  await c.blur()
  return c.field('localisedObject.enUS')
})

// ---------------------------------------------------------------- paragraph
const TALL = { viewport: { width: 1280, height: 2600 }, scroll: 'start' }
/** Chooses the block type `type` (when the field offers several) and clicks Add */
const addBlock = async (c, model, type) => {
  const field = c.field(model)
  if (type) {
    await field.locator('.v-field').first().click()
    await chooseItem(c, type)
  }
  await field.getByRole('button', { name: 'Add', exact: true }).click()
  await c.page.waitForTimeout(700)
}
add('paragraph-default', 'structured_blocks', (c) => c.field('textBlocks'))
add('paragraph-text-filled', 'structured_blocks', async (c) => {
  await addBlock(c, 'textBlocks')
  await addBlock(c, 'textBlocks')
  const headings = c.field('textBlocks').locator('input[aria-label="Heading"]')
  await headings.nth(0).fill('First heading')
  await headings.nth(1).fill('Second heading')
  await c.field('textBlocks').locator('[contenteditable=true]').first().click()
  await c.page.keyboard.type('Body text')
  await c.blur()
  return c.field('textBlocks')
}, TALL)
add('paragraph-types', 'structured_blocks', (c) => c.field('content'))
add('paragraph-types-filled', 'structured_blocks', async (c) => {
  await addBlock(c, 'content', 'Media block')
  await addBlock(c, 'content', 'Group block')
  await c.blur()
  return c.field('content')
}, TALL)
add('paragraph-max', 'structured_blocks', (c) => c.field('hero'))
add('paragraph-max-filled', 'structured_blocks', async (c) => {
  await addBlock(c, 'hero')
  await c.field('hero').locator('input[type=file]').first().setInputFiles(c.files['icon.svg'])
  await c.page.waitForTimeout(900)
  await c.field('hero').locator('input[aria-label="Link"]').fill('https://hero.example.com')
  await c.blur()
  return c.field('hero')
}, TALL)
add('paragraph-required', 'structured_blocks', (c) => c.field('requiredBlocks'))
add('paragraph-required-error', 'structured_blocks', async (c) => {
  await named(c)
  return refuse(c, 'requiredBlocks')
})
add('paragraph-localised', 'structured_blocks', (c) => c.field('localisedBlocks.enUS'))

// ---------------------------------------------------------------- duration
add('duration-template', 'numbers_quantities', async (c) => {
  await c.type('templateDuration', '13005')
  await c.blur()
  return [c.field('templateDuration'), c.field('daysDuration')]
})

// ---------------------------------------------------------------- rating
const rate = async (c, model, step) => {
  await c.field(model).locator('.rating-step').nth(step).click()
  await c.page.mouse.move(5, 5)
}
add('rating-default', 'numbers_quantities', async (c) => {
  await rate(c, 'stars', 3)
  // the left half of the third heart: two and a half
  await rate(c, 'hearts', 4)
  return [c.field('stars'), c.field('hearts')]
})
add('rating-scale', 'numbers_quantities', async (c) => {
  await rate(c, 'scale', 6)
  await rate(c, 'flames', 1)
  return [c.field('scale'), c.field('flames')]
})
add('rating-required-error', 'numbers_quantities', async (c) => {
  await named(c)
  return refuse(c, 'requiredRating')
})
add('rating-states', 'numbers_quantities', (c) => [c.field('readOnlyRating'), c.field('disabledRating')])

// ---------------------------------------------------------------- duration (the box keeps its template)
add('duration-default', 'numbers_quantities', async (c) => {
  await c.type('duration', '0130')
  await c.type('preciseDuration', '013005')
  await c.type('longDuration', '2:3')
  await c.blur()
  return [c.field('duration'), c.field('preciseDuration'), c.field('longDuration')]
})
add('duration-empty', 'numbers_quantities', (c) => [c.field('duration'), c.field('minutesOnly')])
add('duration-limits-error', 'numbers_quantities', (c) => typed(c, 'minutesOnly', '2'))
add('duration-states', 'numbers_quantities', (c) => [c.field('readOnlyDuration'), c.field('disabledDuration')])

// ---------------------------------------------------------------- money
const amount = async (c, model, text) => {
  await c.field(model).locator('input[id$="-amount"]').fill(text)
}
add('money-default', 'numbers_quantities', async (c) => {
  await amount(c, 'price', '1.234,5')
  await c.type('euroPrice', '7')
  await c.blur()
  return [c.field('price'), c.field('euroPrice')]
})
add('money-currency-open', 'numbers_quantities', async (c) => {
  await openList(c, 'mixedPrice')
  return c.field('mixedPrice')
}, { crop: { height: 300 }, scroll: 'start' })
add('money-decimals', 'numbers_quantities', async (c) => {
  await amount(c, 'mixedPrice', '1999.5')
  await c.blur()
  await pick(c, 'mixedPrice', 'KWD')
  return c.field('mixedPrice')
})
add('money-limited-error', 'numbers_quantities', (c) => typed(c, 'limitedPrice', '4'))
add('money-required-error', 'numbers_quantities', async (c) => {
  await named(c)
  return refuse(c, 'requiredPrice')
})
add('money-states', 'numbers_quantities', (c) => [c.field('readOnlyPrice'), c.field('disabledPrice')])

// ---------------------------------------------------------------- phone
const number = (c, model) => c.field(model).locator('input[id$="-number"]')
const dial = async (c, model, text) => {
  await number(c, model).click()
  await number(c, model).fill(text)
  await c.blur()
  return c.field(model)
}
add('phone-default', 'text_formats', async (c) => {
  // a number written with its country says which country it is
  await dial(c, 'phone', '+44 20 7183 8750')
  return c.field('phone')
})
add('phone-country-open', 'text_formats', async (c) => {
  await openList(c, 'europePhone')
  return c.field('europePhone')
}, { crop: { height: 330 }, scroll: 'start' })
add('phone-error', 'text_formats', (c) => dial(c, 'phone', 'call me'))
add('phone-states', 'text_formats', (c) => [c.field('readOnlyPhone'), c.field('disabledPhone')])


module.exports = { specs }
