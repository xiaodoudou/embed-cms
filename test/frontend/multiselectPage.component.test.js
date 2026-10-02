import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import MultiselectPage from '@c/records/MultiselectPage.vue'
import RequestService from '@s/RequestService'
import NotificationsService from '@s/NotificationsService'
import DialogService from '@s/DialogService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/RequestService', () => ({ default: { delete: vi.fn() } }))

const resource = { title: 'articles', name: 'articles', schema: [{ field: 'title', input: 'string' }], locales: ['enUS', 'zhCN'] }
const record = (id, title) => ({ _id: id, title: { enUS: title } })

let wrapper
let loading
let shown
const page = async (items = [record('a1', 'Alpha'), record('b2', 'Beta')]) => {
  wrapper = mountComponent(MultiselectPage, {
    props: { resource, multiselectItems: items, recordList: items },
    global: { mocks: { $loading: loading } },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}
// the delete button asks first; confirming is what the dialog's callback does
const confirm = async () => {
  await wrapper.get('button.delete').trigger('click')
  await shown.mock.calls[shown.mock.calls.length - 1][0].callback()
  await flushPromises()
}

beforeEach(() => {
  loading = { start: vi.fn(), stop: vi.fn() }
  RequestService.delete.mockReset().mockResolvedValue({})
  window.DialogService = DialogService
  shown = vi.fn()
  DialogService.events.on('dialog:show', shown)
  vi.spyOn(NotificationsService, 'send').mockImplementation(() => {})
})
afterEach(() => {
  DialogService.events.off('dialog:show', shown)
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('MultiselectPage (the records that are selected)', () => {
  describe('what it shows', () => {
    it('counts the selected records', async () => {
      await page()
      expect(wrapper.get('.multiselect-title').text()).toBe('2 selected')
    })

    it('shows a chip for each record, with its name and id', async () => {
      await page()
      const chips = wrapper.findAll('.selected-record .v-chip')
      expect(chips.map((chip) => chip.get('.chip-name').text())).toEqual(['Alpha', 'Beta'])
      expect(chips.map((chip) => chip.get('.chip-id').text())).toEqual(['a1', 'b2'])
    })

    it('names a record by its id when it has no name', async () => {
      await page([{ _id: 'x9' }])
      expect(wrapper.get('.chip-name').text()).toBe('x9')
    })

    it('cannot delete when nothing is selected', async () => {
      await page([])
      expect(wrapper.get('.multiselect-title').text()).toBe('0 selected')
      expect(wrapper.get('button.delete').attributes('disabled')).toBeDefined()
    })

    it('marks the list when it is scrolled to the bottom', async () => {
      await page()
      const scroller = wrapper.get('.scroll-wrapper')
      const set = (top, client, height) => {
        for (const [key, value] of Object.entries({ scrollTop: top, clientHeight: client, scrollHeight: height })) {
          Object.defineProperty(scroller.element, key, { value, configurable: true })
        }
      }
      set(0, 100, 400)
      await scroller.trigger('scroll')
      expect(scroller.classes()).not.toContain('scrolled-to-bottom')
      set(300, 100, 400)
      await scroller.trigger('scroll')
      expect(scroller.classes()).toContain('scrolled-to-bottom')
    })
  })

  describe('deselecting', () => {
    it('removes a record from the selection with its close button', async () => {
      await page()
      await wrapper.findAll('.v-chip__close')[0].trigger('click')
      expect(wrapper.emitted('changeMultiselectItems')[0][0].map((item) => item._id)).toEqual(['b2'])
    })

    it('names the record on the close button', async () => {
      await page()
      expect(wrapper.findAll('.v-chip__close')[0].attributes('aria-label')).toBe('Deselect Alpha')
    })
  })

  describe('deleting', () => {
    it('asks first, and names the record when there is one', async () => {
      await page([record('a1', 'Alpha')])
      await wrapper.get('button.delete').trigger('click')
      expect(shown).toHaveBeenCalledTimes(1)
      const dialog = shown.mock.calls[0][0]
      expect(dialog.title).toBe('Delete "Alpha"?')
      expect(dialog.message).toContain('This cannot be undone.')
      expect(dialog.destructive).toBe(true)
      expect(RequestService.delete).not.toHaveBeenCalled()
    })

    it('asks with the number of records, and the first names', async () => {
      await page([record('a', 'A'), record('b', 'B'), record('c', 'C'), record('d', 'D'), record('e', 'E')])
      await wrapper.get('button.delete').trigger('click')
      const dialog = shown.mock.calls[0][0]
      expect(dialog.title).toBe('Delete 5 records?')
      expect(dialog.message).toContain('A, B, C +2.')
    })

    it('deletes every record, one at a time, from the API of the resource', async () => {
      await page()
      await confirm()
      expect(RequestService.delete.mock.calls).toEqual([['../api/articles/a1'], ['../api/articles/b2']])
    })

    it('tells how many were deleted, then refreshes the list and closes', async () => {
      await page()
      await confirm()
      expect(NotificationsService.send).toHaveBeenCalledWith('2 records deleted', 'success', {})
      expect(wrapper.emitted('updateRecordList')).toHaveLength(1)
      expect(wrapper.emitted('cancel')).toHaveLength(1)
      expect(loading.start).toHaveBeenCalledWith('onDeleteMultiselectedItems')
      expect(loading.stop).toHaveBeenCalledWith('onDeleteMultiselectedItems')
    })

    it('says "Record deleted" for a single record', async () => {
      await page([record('a1', 'Alpha')])
      await confirm()
      expect(NotificationsService.send).toHaveBeenCalledWith('Record deleted', 'success', {})
    })

    it('goes on after a record that cannot be deleted, says so, and counts only those that went', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      RequestService.delete.mockRejectedValueOnce({ code: 403, message: 'no' }).mockResolvedValueOnce({})
      await page([record('a1', 'Alpha'), record('b2', 'Beta'), record('c3', 'Gamma')])
      await confirm()
      expect(RequestService.delete).toHaveBeenCalledTimes(3)
      const sent = NotificationsService.send.mock.calls.map((call) => [call[0], call[1]])
      expect(sent).toContainEqual(['Error on record delete', 'error'])
      expect(sent).toContainEqual(['2 records deleted', 'success'])
      expect(wrapper.emitted('cancel')).toHaveLength(1)
    })

    it('says nothing is deleted when every delete fails, and still gives the screen back', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      RequestService.delete.mockRejectedValue({ code: 500 })
      await page()
      await confirm()
      const sent = NotificationsService.send.mock.calls.map((call) => call[1])
      expect(sent).toEqual(['error', 'error'])
      expect(loading.stop).toHaveBeenCalledWith('onDeleteMultiselectedItems')
      expect(wrapper.emitted('updateRecordList')).toHaveLength(1)
    })

    it('can be cancelled from the outside', async () => {
      await page()
      wrapper.vm.onClickCancel()
      expect(wrapper.emitted('cancel')).toHaveLength(1)
    })
  })
})
