import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '@c/App.vue'
import RecordList from '@c/RecordList.vue'
import DialogService from '@s/DialogService'
import TranslateService from '@s/TranslateService'
import ResourceService from '@s/ResourceService'
import LoginService from '@s/LoginService'
import { mountComponent } from './helpers/mountField.js'

vi.mock('@s/ConfigService', () => ({ default: { init: vi.fn(async () => {}), config: {} } }))
vi.mock('@s/LoginService', () => ({
  default: {
    user: { username: 'localAdmin' },
    init: vi.fn(),
    getStatus: vi.fn(async () => ({ username: 'localAdmin', group: 'admins', theme: 'light' })),
    getPlugins: vi.fn(async () => []),
    onLogout: vi.fn(),
    logout: vi.fn()
  }
}))
vi.mock('@s/ResourceService', () => ({
  default: {
    getAll: vi.fn(),
    getAllParagraphs: vi.fn(async () => []),
    setSchemas: vi.fn(),
    get: vi.fn(),
    cache: vi.fn(),
    getSchema: vi.fn(() => ({}))
  }
}))

// The children of the app are components of their own: stand-ins keep these tests on what App does, which is deciding what is
// open (resource, record), keeping the address in step, and guarding unsaved edits.
const stub = (name, extra = {}) => ({ name, template: `<div class="stub-${name}" />`, ...extra })
const stubs = {
  NavBar: stub('NavBar', { props: ['selectedItem'] }),
  NavRail: stub('NavRail', { props: ['selectedItem'] }),
  ResourceList: stub('ResourceList', { props: ['selectedItem'] }),
  RecordTable: stub('RecordTable'),
  MultiselectPage: stub('MultiselectPage'),
  PluginPage: stub('PluginPage'),
  DesignSystem: stub('DesignSystem'),
  UpdatesNotifier: stub('UpdatesNotifier'),
  UploadPanel: stub('UploadPanel'),
  ToastHost: stub('ToastHost'),
  AppDialog: stub('AppDialog'),
  LocaleList: stub('LocaleList'),
  Loading: stub('Loading'),
  RecordList: { ...RecordList, template: undefined, render: () => null, name: 'RecordList', props: ['list', 'selectedItem', 'resource'], emits: ['select-item', 'select-multiselect', 'change-multiselect-items', 'update-record-list'] },
  RecordEditor: { name: 'RecordEditor', props: ['record', 'resource', 'locale', 'userLocale'], emits: ['update:record', 'update:locale', 'update-record-list', 'back'], template: '<div class="stub-RecordEditor" />' }
}

const resources = [
  { title: 'orders', displayname: { enUS: 'Orders' }, group: { enUS: 'Shop' }, locales: ['enUS'], schema: [{ field: 'name', input: 'string', label: 'Name', localised: false }] },
  { title: 'products', displayname: { enUS: 'Products' }, group: { enUS: 'Shop' }, locales: ['enUS'], schema: [{ field: 'name', input: 'string', label: 'Name', localised: false }] }
]
const records = {
  orders: [{ _id: 'ord1', name: 'First order', _local: true, _updatedAt: 3 }],
  products: [
    { _id: 'mu0aaaaa', name: 'Aurora lamp', _local: true, _updatedAt: 3 },
    { _id: 'mu0bbbbb', name: 'Basalt mug', _local: true, _updatedAt: 2 },
    { _id: 'mu0ccccc', name: 'Cedar shelf', _local: true, _updatedAt: 1 }
  ]
}

let wrapper
let router
const recordList = () => wrapper.findComponent({ name: 'RecordList' })
const recordEditor = () => wrapper.findComponent({ name: 'RecordEditor' })
const query = () => ({ ...router.currentRoute.value.query })
// the address follows the open record a moment later (it waits for the selection to settle)
const settle = async () => {
  await flushPromises()
  vi.advanceTimersByTime(200)
  await flushPromises()
}

const mountApp = async (address = '/') => {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: App }] })
  await router.push(address)
  await router.isReady()
  wrapper = mountComponent(App, {
    global: { plugins: [router], stubs, mocks: { $loading: { start: vi.fn(), stop: vi.fn() } } },
    attachTo: document.body
  })
  await settle()
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  window.DialogService = DialogService
  window.plugins = []
  TranslateService.init = vi.fn(async () => {})
  TranslateService.config = { locales: ['enUS'], defaultLocale: 'enUS' }
  window.localStorage.clear()
  ResourceService.getAll.mockReset().mockResolvedValue(resources)
  ResourceService.get.mockReset().mockImplementation((title) => records[title].map((record) => ({ ...record })))
  ResourceService.cache.mockReset().mockImplementation(async (title) => records[title].map((record) => ({ ...record })))
  LoginService.getStatus.mockClear()
})
afterEach(() => {
  wrapper?.unmount()
  DialogService.send(false)
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('App', () => {
  describe('starting', () => {
    it('opens the first resource of the first group when the address names none, and puts it in the address', async () => {
      await mountApp('/')
      expect(query().id).toBe('orders')
      expect(wrapper.vm.selectedResource.title).toBe('orders')
      expect(recordList().exists()).toBe(true)
    })

    it('opens the resource named in the address', async () => {
      await mountApp('/?id=products')
      expect(wrapper.vm.selectedResource.title).toBe('products')
      expect(recordList().props('list').map((record) => record._id)).toEqual(['mu0aaaaa', 'mu0bbbbb', 'mu0ccccc'])
    })

    it('opens no record by itself', async () => {
      await mountApp('/?id=products')
      expect(wrapper.vm.selectedRecord).toBe(null)
      expect(wrapper.find('.cms-editor-empty').exists()).toBe(true)
    })

    it('logs out when the resources cannot be loaded', async () => {
      ResourceService.getAll.mockRejectedValue(new Error('down'))
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountApp('/')
      expect(LoginService.logout).toHaveBeenCalled()
      error.mockRestore()
    })
  })

  describe('the open record is in the address', () => {
    it('opens the record named in the address once the list is loaded', async () => {
      await mountApp('/?id=products&record=mu0bbbbb')
      expect(wrapper.vm.selectedRecord._id).toBe('mu0bbbbb')
      expect(recordEditor().exists()).toBe(true)
      expect(query().record).toBe('mu0bbbbb')
    })

    it('ignores a record that is not in the list, without breaking', async () => {
      await mountApp('/?id=products&record=nothere')
      expect(wrapper.vm.selectedRecord).toBe(null)
      expect(wrapper.vm.selectedResource.title).toBe('products')
    })

    it('writes the record into the address when one is opened', async () => {
      await mountApp('/?id=products')
      recordList().vm.$emit('select-item', wrapper.vm.recordList.find((record) => record._id === 'mu0ccccc'))
      await settle()
      expect(query()).toEqual({ id: 'products', record: 'mu0ccccc' })
    })

    it('moves between records with the back and forward buttons', async () => {
      await mountApp('/?id=products')
      const open = async (id) => {
        recordList().vm.$emit('select-item', wrapper.vm.recordList.find((record) => record._id === id))
        await settle()
      }
      await open('mu0aaaaa')
      await open('mu0bbbbb')
      router.back()
      await settle()
      expect(wrapper.vm.selectedRecord._id).toBe('mu0aaaaa')
      router.forward()
      await settle()
      expect(wrapper.vm.selectedRecord._id).toBe('mu0bbbbb')
    })

    it('leaves the record when back reaches an address without one', async () => {
      await mountApp('/?id=products')
      recordList().vm.$emit('select-item', wrapper.vm.recordList[0])
      await settle()
      router.back()
      await settle()
      expect(wrapper.vm.selectedRecord).toBe(null)
    })

    it('opens a blank record, not the empty state, when "new record" is chosen while a record is open', async () => {
      await mountApp('/?id=products&record=mu0aaaaa')
      expect(wrapper.vm.selectedRecord._id).toBe('mu0aaaaa')
      recordList().vm.$emit('select-item', { _local: true })
      await settle()
      expect(wrapper.vm.selectedRecord).toEqual({ _local: true })
      expect(recordEditor().exists()).toBe(true)
      expect(wrapper.find('.cms-editor-empty').exists()).toBe(false)
      // the address no longer names a record, and does not bring the old one back
      expect(query()).toEqual({ id: 'products' })
      expect(wrapper.vm.selectedRecord).toEqual({ _local: true })
    })

    it('keeps the address on the open record when a save refills the list', async () => {
      await mountApp('/?id=products&record=mu0aaaaa')
      recordEditor().vm.$emit('update-record-list', { _id: 'mu0aaaaa' })
      await settle()
      expect(wrapper.vm.selectedRecord._id).toBe('mu0aaaaa')
      expect(query().record).toBe('mu0aaaaa')
    })
  })

  describe('resources', () => {
    it('opens another resource, closes the record and changes the address', async () => {
      await mountApp('/?id=products&record=mu0aaaaa')
      await wrapper.vm.selectResource(resources[0])
      await settle()
      expect(wrapper.vm.selectedResource.title).toBe('orders')
      expect(wrapper.vm.selectedRecord).toBe(null)
      expect(query()).toEqual({ id: 'orders' })
    })

    it('follows the address when it changes to another resource', async () => {
      await mountApp('/?id=products')
      await router.push('/?id=orders')
      await settle()
      expect(wrapper.vm.selectedResource.title).toBe('orders')
    })

    it('does not reload the resource when only the record in the address changes', async () => {
      await mountApp('/?id=products')
      const loads = ResourceService.get.mock.calls.length
      await router.push('/?id=products&record=mu0bbbbb')
      await settle()
      expect(ResourceService.get.mock.calls.length).toBe(loads)
      expect(wrapper.vm.selectedRecord._id).toBe('mu0bbbbb')
    })
  })

  describe('unsaved edits', () => {
    it('asks before leaving the record for another, and does not leave yet', async () => {
      await mountApp('/?id=products&record=mu0aaaaa')
      const shown = vi.fn()
      DialogService.events.on('dialog:show', shown)
      DialogService.send(true)
      recordList().vm.$emit('select-item', wrapper.vm.recordList.find((record) => record._id === 'mu0bbbbb'))
      await settle()
      expect(shown).toHaveBeenCalled()
      expect(wrapper.vm.selectedRecord._id).toBe('mu0aaaaa')
      DialogService.events.off('dialog:show', shown)
    })

    it('puts the address back on the open record when back is pressed over unsaved edits', async () => {
      await mountApp('/?id=products')
      recordList().vm.$emit('select-item', wrapper.vm.recordList[0])
      await settle()
      recordList().vm.$emit('select-item', wrapper.vm.recordList[1])
      await settle()
      expect(query().record).toBe('mu0bbbbb')
      DialogService.send(true)
      router.back()
      await settle()
      expect(wrapper.vm.selectedRecord._id).toBe('mu0bbbbb')
      expect(query().record).toBe('mu0bbbbb')
    })

    it('leaves the record after the person confirms', async () => {
      await mountApp('/?id=products&record=mu0aaaaa')
      DialogService.send(true)
      recordList().vm.$emit('select-item', wrapper.vm.recordList.find((record) => record._id === 'mu0ccccc'))
      await settle()
      await wrapper.vm.confirmDialog()
      await settle()
      expect(wrapper.vm.selectedRecord._id).toBe('mu0ccccc')
    })
  })

  describe('the menu groups', () => {
    it('lists CMS first, Others last and the rest alphabetically by their displayed name', async () => {
      const schema = resources[0].schema
      ResourceService.getAll.mockResolvedValue([
        { title: 'orders', displayname: { enUS: 'Orders' }, group: { enUS: 'Shop', zhCN: '商店' }, locales: ['enUS'], schema },
        { title: 'loose', displayname: { enUS: 'Loose' }, locales: ['enUS'], schema },
        { title: '_users', displayname: { enUS: 'Users' }, group: { enUS: 'CMS', zhCN: '内容管理系统' }, locales: ['enUS'], schema },
        { title: 'posts', displayname: { enUS: 'Posts' }, group: 'blog', locales: ['enUS'], schema },
        { title: 'visits', displayname: { enUS: 'Visits' }, group: { enUS: 'Analytics', zhCN: '分析' }, locales: ['enUS'], schema }
      ])
      window.plugins = [{ title: 'Syslog', displayname: 'Syslog', group: 'System', allowed: ['admins'] }]
      LoginService.getPlugins.mockResolvedValueOnce(['Syslog'])
      ResourceService.get.mockReturnValue([])
      ResourceService.cache.mockResolvedValue([])
      await mountApp('/')
      expect(wrapper.vm.groupedList.map((group) => TranslateService.get(group.name))).toEqual(['CMS', 'Analytics', 'blog', 'Shop', 'System', 'Others'])
    })
  })

  describe('the breadcrumb', () => {
    it('shows the group, the resource and, when one is open, the record', async () => {
      await mountApp('/?id=products&record=mu0aaaaa')
      const crumbs = wrapper.findAll('.cms-crumbs .crumb-item').map((item) => item.text())
      expect(crumbs[0]).toContain('Shop')
      expect(crumbs[1]).toContain('Products')
      expect(crumbs[2]).toContain('Aurora lamp')
    })

    it('makes the resource a link back to the list while a record is open, and plain text otherwise', async () => {
      await mountApp('/?id=products')
      expect(wrapper.find('.crumb-item span.crumb').exists()).toBe(true)
      expect(wrapper.find('button.crumb-link.crumb').exists()).toBe(false)
      await router.push('/?id=products&record=mu0aaaaa')
      await settle()
      expect(wrapper.find('button.crumb.crumb-link').exists()).toBe(true)
    })
  })
})
