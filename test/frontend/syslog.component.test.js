import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import Syslog from '@c/pages/Syslog.vue'
import { mountComponent } from './helpers/mountField.js'

// the live stream of log lines: a stand-in for the browser's EventSource that the tests drive by hand
class FakeEventSource {
  static instances = []
  constructor (url) {
    this.url = url
    this.closed = false
    this.listeners = {}
    FakeEventSource.instances.push(this)
  }
  addEventListener (name, fn) { this.listeners[name] = fn }
  close () { this.closed = true }
  line (id, text, level = 0) { this.onmessage({ data: JSON.stringify({ id, line: text, level }) }) }
  end () { this.listeners.end() }
  fail () { this.onerror(new Event('error')) }
}

// the list that draws only the visible rows is a component of its own: this one draws them all
const RecycleScroller = {
  name: 'RecycleScroller',
  props: ['items', 'itemSize', 'sizeField', 'keyField'],
  methods: { scrollToItem (index) { this.$emit('scrolled-to', index) } },
  template: '<div class="scroller"><template v-for="item in items" :key="item.id"><slot :item="item" /></template></div>'
}

let wrapper
let loading
const page = async () => {
  wrapper = mountComponent(Syslog, { global: { components: { RecycleScroller }, mocks: { $loading: loading }, config: { warnHandler: () => {} } }, attachTo: document.body })
  await flushPromises()
  vi.advanceTimersByTime(1)
  await flushPromises()
  return wrapper
}
const stream = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]
// lines arrive in batches: wait for the batch, then for the list to be built
const settle = async () => {
  vi.advanceTimersByTime(60)
  await flushPromises()
  vi.advanceTimersByTime(400)
  await flushPromises()
}
const send = async (...lines) => {
  lines.forEach(([id, text, level]) => stream().line(id, text, level))
  await settle()
}
const shown = () => wrapper.findAll('.log-line').map((line) => line.get('.line-content').text())
const type = async (text) => {
  await wrapper.get('input.search').setValue(text)
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  loading = { start: vi.fn(), stop: vi.fn() }
  try { localStorage.clear() } catch { /* the page does without */ }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Syslog (the log viewer)', () => {
  describe('the stream', () => {
    it('connects to the log stream of the API, and shows the loading mark until a line comes', async () => {
      await page()
      expect(stream().url).toMatch(/\.\.\/api\/_syslog$/)
      expect(loading.start).toHaveBeenCalledWith('_syslog')
      expect(loading.stop).not.toHaveBeenCalled()
      stream().line(1, 'hello')
      expect(loading.stop).toHaveBeenCalledWith('_syslog')
    })

    it('shows the lines with their numbers', async () => {
      await page()
      await send([1, 'first'], [2, 'second'])
      expect(shown()).toEqual(['first', 'second'])
      expect(wrapper.findAll('.line-number').map((item) => item.text())).toEqual(['1', '2'])
    })

    it('shows the first line of the server, which has the number 0', async () => {
      await page()
      await send([0, 'the very first'], [1, 'second'])
      expect(shown()).toEqual(['the very first', 'second'])
    })

    it('shows a line once, even if the server sends it twice', async () => {
      await page()
      await send([1, 'once'], [1, 'once'])
      expect(shown()).toEqual(['once'])
    })

    it('ignores a message that is not a line, and says so when it is not JSON', async () => {
      await page()
      stream().onmessage({ data: 'not json' })
      stream().onmessage({ data: JSON.stringify({ id: 3 }) })
      await send([1, 'ok'])
      expect(shown()).toEqual(['ok'])
      expect(console.error).toHaveBeenCalled()
    })

    it('keeps only the newest lines', async () => {
      await page()
      for (let id = 1; id <= 5010; id++) stream().line(id, `line ${id}`)
      // the batch is taken in, but the list is not drawn (5000 rows are slow to draw for nothing)
      vi.advanceTimersByTime(60)
      expect(wrapper.vm.logLines).toHaveLength(5000)
      expect(wrapper.vm.logLines[0].id).toBe(11)
    })

    it('does not run a harmful tag in a line', async () => {
      await page()
      await send([1, '<img src=x onerror="window.pwned=1"> done'])
      expect(wrapper.find('.line-content img').exists()).toBe(false)
    })

    it('colours a line by its level', async () => {
      await page()
      await send([1, 'info', 0], [2, 'warn', 1], [3, 'error', 2], [4, 'quiet', -1])
      expect(wrapper.findAll('.log-line').map((line) => line.classes().find((name) => name.startsWith('level-')))).toEqual(['level-info', 'level-warn', 'level-error', 'level-quiet'])
    })

    it('counts the warnings and the errors', async () => {
      await page()
      await send([1, 'a', 1], [2, 'b', 2], [3, 'c', 2])
      expect(wrapper.get('.flag-warning').text()).toBe('1')
      expect(wrapper.get('.flag-error').text()).toBe('2')
    })
  })

  describe('when the stream breaks', () => {
    it('says so and connects again after a growing delay', async () => {
      await page()
      stream().fail()
      await flushPromises()
      expect(wrapper.get('.error-syslog').text()).toBe('Failed to retreive syslog')
      vi.advanceTimersByTime(1999)
      expect(FakeEventSource.instances).toHaveLength(1)
      vi.advanceTimersByTime(10)
      expect(FakeEventSource.instances).toHaveLength(2)
      stream().fail()
      vi.advanceTimersByTime(4010)
      expect(FakeEventSource.instances).toHaveLength(3)
    })

    it('clears the error when a line arrives again', async () => {
      await page()
      stream().fail()
      vi.advanceTimersByTime(2010)
      await send([1, 'back'])
      expect(wrapper.find('.error-syslog').exists()).toBe(false)
    })

    it('gives up after ten attempts', async () => {
      await page()
      for (let attempt = 0; attempt < 10; attempt++) {
        stream().fail()
        vi.advanceTimersByTime(40000)
      }
      const count = FakeEventSource.instances.length
      stream().fail()
      vi.advanceTimersByTime(60000)
      expect(FakeEventSource.instances).toHaveLength(count)
      expect(wrapper.vm.error).toMatch(/after multiple attempts/)
    })

    it('closes and does not reconnect when the server ends the stream', async () => {
      await page()
      stream().end()
      expect(stream().closed).toBe(true)
      vi.advanceTimersByTime(60000)
      expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('does not reconnect after the page is gone', async () => {
      await page()
      const source = stream()
      source.fail()
      wrapper.unmount()
      wrapper = undefined
      vi.advanceTimersByTime(60000)
      expect(FakeEventSource.instances).toHaveLength(1)
      expect(source.closed).toBe(true)
    })

    it('closes the stream when it goes away', async () => {
      await page()
      const source = stream()
      wrapper.unmount()
      wrapper = undefined
      expect(source.closed).toBe(true)
    })
  })

  describe('searching', () => {
    beforeEach(async () => {
      await page()
      await send([1, 'server started'], [2, 'user logged in', 0], [3, 'disk almost full', 1], [4, 'crash!', 2])
    })

    it('shows only the lines that contain the text, whatever the case', async () => {
      await type('SERVER')
      expect(shown()).toEqual(['server started'])
    })

    it('says how many lines are filtered out', async () => {
      await type('server')
      expect(wrapper.get('.filter-out').text()).toContain('3 lines are filter out')
    })

    it('shows everything again when the search is cleared', async () => {
      await type('server')
      await wrapper.get('.clear-search').trigger('click')
      await settle()
      expect(shown()).toHaveLength(4)
      expect(wrapper.find('.clear-search').exists()).toBe(false)
    })

    it('clears the search with Escape, and keeps the focus in the field', async () => {
      await type('server')
      const input = wrapper.get('input.search')
      await input.trigger('keydown', { key: 'Escape' })
      await settle()
      expect(wrapper.vm.searchKey).toBe('')
      expect(shown()).toHaveLength(4)
    })

    it('understands a query that starts with sift:', async () => {
      await type('sift:{level: {$gte: 2}}')
      expect(shown()).toEqual(['crash!'])
      expect(wrapper.get('input.search').classes()).toContain('is-sift')
    })

    it('goes on showing everything while a sift query is not finished', async () => {
      await type('sift:{level: {$gte')
      expect(shown()).toHaveLength(4)
    })

    it('filters by level from the warning and error flags', async () => {
      await wrapper.get('.flag-warning').trigger('click')
      await settle()
      expect(shown()).toEqual(['disk almost full', 'crash!'])
      await wrapper.get('.flag-error').trigger('click')
      await settle()
      expect(shown()).toEqual(['crash!'])
    })
  })

  describe('the buttons', () => {
    it('has labelled buttons', async () => {
      await page()
      expect(wrapper.get('[role="toolbar"]').attributes('aria-label')).toBe('Log viewer tools')
      expect(wrapper.get('button.autoscroll').attributes('aria-label')).toBe('Autoscroll')
      expect(wrapper.get('button.wrap').attributes('aria-label')).toBe('Wrap lines')
    })

    it('clears the lines', async () => {
      await page()
      await send([1, 'a'])
      await wrapper.get('button.clear').trigger('click')
      await settle()
      expect(shown()).toEqual([])
    })

    it('connects again with Refresh to get the backlog', async () => {
      await page()
      await send([1, 'a'])
      await wrapper.get('button.refresh').trigger('click')
      vi.advanceTimersByTime(1)
      await settle()
      expect(shown()).toEqual([])
      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.instances[0].closed).toBe(true)
    })

    it('turns the autoscroll off and on', async () => {
      await page()
      const button = wrapper.get('button.autoscroll')
      expect(button.attributes('aria-pressed')).toBe('true')
      await button.trigger('click')
      expect(button.attributes('aria-pressed')).toBe('false')
      await button.trigger('click')
      expect(button.attributes('aria-pressed')).toBe('true')
    })

    it('wraps long lines, and remembers it for the next visit', async () => {
      await page()
      const button = wrapper.get('button.wrap')
      expect(wrapper.get('.syslog').classes()).not.toContain('wrapped')
      await button.trigger('click')
      expect(wrapper.get('.syslog').classes()).toContain('wrapped')
      expect(button.attributes('aria-pressed')).toBe('true')
      wrapper.unmount()
      await page()
      expect(wrapper.get('.syslog').classes()).toContain('wrapped')
    })

    it('selects a line from its number, and stops following the end', async () => {
      await page()
      await send([1, 'a'], [2, 'b'])
      await wrapper.findAll('.line-number')[0].trigger('click')
      await settle()
      expect(wrapper.vm.autoscroll).toBe(false)
      expect(wrapper.findAll('.log-line')[0].classes()).toContain('selected')
    })
  })
})
