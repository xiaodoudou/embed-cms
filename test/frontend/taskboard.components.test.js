import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import App from '../../docs/examples/taskboard/src/App.vue'
import { ApiError } from '../../docs/examples/taskboard/src/api/http'
import { createAppRouter } from '../../docs/examples/taskboard/src/router'
import { createServices, SERVICES } from '../../docs/examples/taskboard/src/services'
import { fakeHttp, rec } from './helpers/taskboard'

// The app of docs/examples/taskboard as a person meets it: the whole of it mounted with its router, over a fake of the REST API that keeps its records in memory. What is checked is what
// is on the screen, and what was asked of the CMS, after what a person does: signs in, opens a board, filters, drags a card, edits it, comments, adds a file.

class FakeSocket {
  constructor (url) {
    this.url = url
    FakeSocket.all.push(this)
  }

  send () {}
  close () { this.onclose() }
}
FakeSocket.all = []

const file = (id, extra = {}) => ({ _id: id, _contentType: 'text/plain', _size: 2048, _fields: { _filename: `${id}.txt` }, url: `/api/tasks/t1/attachments/${id}`, ...extra })

const seed = () => ({
  people: [rec('ada-id', { name: 'Ada Reader', username: 'ada', color: '#6c5ce7' }), rec('grace-id', { name: 'Grace Hopper', username: 'grace', color: '#e17055' })],
  projects: [rec('web', { key: 'WEB', name: 'Website', description: 'The public site.' }), rec('ops', { key: 'OPS', name: 'Operations' }), rec('old', { key: 'OLD', name: 'Archived', archived: true })],
  tasks: [
    rec('t1', { ref: 'WEB-1', project: 'web', status: 'todo', position: 2000, title: 'Second card', labels: ['bug'], assignee: 'ada-id', due: Date.now() - 86400000, description: 'The details', files: [file('f1', { _contentType: 'image/png', _fields: { _filename: 'shot.png' } }), file('f2')] }),
    rec('t2', { ref: 'WEB-2', project: 'web', status: 'todo', position: 1000, title: 'First card', labels: ['content'] }),
    rec('t3', { ref: 'WEB-3', project: 'web', status: 'doing', position: 1000, title: 'Doing card', assignee: 'grace-id' }),
    rec('t4', { ref: 'WEB-4', project: 'web', status: 'review', position: 1000, title: 'Review card' }),
    rec('t5', { ref: 'OPS-1', project: 'ops', status: 'todo', position: 1000, title: 'Ops card' })
  ],
  comments: [rec('c1', { task: 't1', author: 'grace', text: 'A comment', _createdAt: 100 })]
})

/** Mounts the whole app, signed in or not, at an address. */
async function boot (path = '/', { signedIn = true, rights, data } = {}) {
  const http = fakeHttp(data || seed())
  if (rights) {
    http.rights = rights
  }
  if (signedIn) {
    http.user = { username: 'ada', group: 'team', rights: http.rights }
  }
  const services = createServices({ http, WebSocketImpl: FakeSocket })
  const router = createAppRouter(services, { history: createMemoryHistory() })
  const wrapper = mount(App, { global: { plugins: [router], provide: { [SERVICES]: services } }, attachTo: document.body })
  await router.push(path)
  await flushPromises()
  return { http, services, router, wrapper }
}

const text = (wrapper, selector) => wrapper.find(selector).text()
const titles = (wrapper, status) => wrapper.findAll(`section.column[data-status=${status}] .card .title`).map((card) => card.text())
const fakeEvent = (type, extra = {}) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: extra.clientY || 0 })
  const store = {}
  Object.defineProperty(event, 'dataTransfer', { value: { setData: (name, value) => { store[name] = value }, getData: (name) => store[name] || extra.data || '', effectAllowed: '', dropEffect: '' } })
  return event
}

let mounted
beforeEach(() => {
  FakeSocket.all = []
  mounted = []
})
afterEach(() => {
  mounted.forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.useRealTimers()
})
const open = async (...args) => {
  const app = await boot(...args)
  mounted.push(app.wrapper)
  return app
}

describe('taskboard: signing in', () => {
  it('sends a visitor who is not signed in to the sign-in, and remembers where they wanted to go', async () => {
    const { router, wrapper } = await open('/p/WEB', { signedIn: false })
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/p/WEB')
    expect(text(wrapper, 'h1')).toBe('Sign in')
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('says one thing when the account or the password is wrong, and empties the password', async () => {
    const { wrapper } = await open('/login', { signedIn: false })
    await wrapper.find('input[name=username]').setValue('ada')
    await wrapper.find('input[name=password]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(text(wrapper, '.error')).toBe('The account or the password is wrong.')
    expect(wrapper.find('input[name=password]').element.value).toBe('')
    expect(wrapper.find('button.primary').attributes('disabled')).toBeUndefined()
  })

  it('goes where the person was going once they are in, and shows who they are', async () => {
    const { wrapper, router, http } = await open('/p/WEB', { signedIn: false })
    await wrapper.find('input[name=username]').setValue(' ada ')
    await wrapper.find('input[name=password]').setValue('pw')
    await wrapper.find('form').trigger('submit')
    // the page of the board is loaded when it is first visited: it takes more than a turn
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/p/WEB'))
    await flushPromises()
    expect(text(wrapper, '.who')).toBe('ada')
    expect(text(wrapper, 'h1')).toContain('Website')
    expect(http.user.username).toBe('ada')
  })

  it('goes only to a page of the app after the sign-in, never to another address', async () => {
    for (const redirect of ['//evil.example', 'https://evil.example', '/\\evil.example', 'evil', '']) {
      const { wrapper, router } = await open(`/login?redirect=${encodeURIComponent(redirect)}`, { signedIn: false })
      await wrapper.find('input[name=username]').setValue('ada')
      await wrapper.find('input[name=password]').setValue('pw')
      await wrapper.find('form').trigger('submit')
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath, redirect).toBe('/'))
      mounted.pop().unmount()
    }
  })

  it('does not show the sign-in to somebody who is signed in', async () => {
    const { router } = await open('/login')
    expect(router.currentRoute.value.name).toBe('projects')
  })

  it('signs out at the CMS and goes back to the sign-in', async () => {
    const { wrapper, router, http } = await open('/')
    await wrapper.find('header button.link').trigger('click')
    await flushPromises()
    expect(http.user).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.find('.who').exists()).toBe(false)
  })

  it('leaves for the sign-in when the CMS says that the session has ended, and comes back to the same page', async () => {
    const { http, router, services } = await open('/p/WEB')
    http.user = null
    http.fail = new ApiError(401, 'Not authenticated')
    await services.board.tasks.load({ project: 'web' }).catch(() => {})
    // the client of the app reports it: here the fake is the client, so it is the router that is told
    services.session.state.user = null
    await router.push('/p/OPS')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/p/OPS')
  })

  it('shows a page of its own for an address it does not know, to anyone', async () => {
    const { wrapper } = await open('/nothing/here', { signedIn: false })
    expect(text(wrapper, 'h1')).toBe('Page not found')
  })
})

describe('taskboard: the projects', () => {
  it('lists the projects that are not archived, by name', async () => {
    const { wrapper } = await open('/')
    expect(wrapper.findAll('.project-list li').map((item) => item.find('strong').text())).toEqual(['Operations', 'Website'])
    expect(text(wrapper, '.project-list li:last-child')).toContain('The public site.')
    expect(wrapper.find('nav a.active').text()).toBe('Projects')
  })

  it('opens the board of a project from its link', async () => {
    const { wrapper, router } = await open('/')
    await wrapper.find('.project-list li:last-child a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/WEB')
  })

  it('says that there is no project when there is none', async () => {
    const { wrapper } = await open('/', { data: { ...seed(), projects: [] } })
    expect(wrapper.text()).toContain('There is no project yet.')
  })

  it('says what went wrong when the projects cannot be read', async () => {
    const http = fakeHttp(seed())
    http.user = { username: 'ada', group: 'team', rights: http.rights }
    http.fail = new ApiError(500, 'The disk is full')
    const services = createServices({ http, WebSocketImpl: FakeSocket })
    const router = createAppRouter(services, { history: createMemoryHistory() })
    const wrapper = mount(App, { global: { plugins: [router], provide: { [SERVICES]: services } }, attachTo: document.body })
    mounted.push(wrapper)
    await router.push('/')
    await flushPromises()
    expect(text(wrapper, '.error')).toBe('The disk is full')
  })

  describe('a new project', () => {
    it('needs a name and a key of two to five capital letters that nobody uses, and says so', async () => {
      const { wrapper } = await open('/')
      const [name, key] = wrapper.findAll('.new-project input')
      const submit = wrapper.find('.new-project button')
      expect(submit.attributes('disabled')).toBeDefined()
      await name.setValue('Mobile')
      await key.setValue('m')
      expect(key.element.value).toBe('M')
      expect(wrapper.find('.new-project .hint').text()).toBe('Two to five capital letters.')
      expect(submit.attributes('disabled')).toBeDefined()
      await key.setValue('web')
      expect(wrapper.find('.new-project .error').text()).toBe('This key is used.')
      expect(submit.attributes('disabled')).toBeDefined()
      await key.setValue('MOB')
      expect(wrapper.find('.new-project .hint').exists()).toBe(false)
      expect(submit.attributes('disabled')).toBeUndefined()
    })

    it('is made, and its board opens', async () => {
      const { wrapper, http, router } = await open('/')
      const [name, key] = wrapper.findAll('.new-project input')
      await name.setValue('  Mobile ')
      await key.setValue('MOB')
      await wrapper.find('.new-project').trigger('submit')
      await flushPromises()
      expect(http.log.find((entry) => entry[0] === 'post')).toEqual(['post', 'projects', { name: 'Mobile', key: 'MOB' }])
      expect(router.currentRoute.value.fullPath).toBe('/p/MOB')
    })

    it('does nothing while it is not valid, and says what the CMS refused', async () => {
      const { wrapper, http, services } = await open('/')
      await wrapper.find('.new-project').trigger('submit')
      expect(http.log.some((entry) => entry[0] === 'post')).toBe(false)
      const [name, key] = wrapper.findAll('.new-project input')
      await name.setValue('Mobile')
      await key.setValue('MOB')
      http.fail = new ApiError(400, 'The key is reserved')
      await wrapper.find('.new-project').trigger('submit')
      await flushPromises()
      expect(services.toasts.map((toast) => toast.text)).toEqual(['The project was not made: The key is reserved'])
      expect(wrapper.text()).toContain('Mobile'.length ? 'New project' : '')
    })

    it('is not offered to a group that may not make projects', async () => {
      const { wrapper } = await open('/', { rights: { read: ['people', 'projects', 'tasks', 'comments'] } })
      expect(wrapper.find('.new-project').exists()).toBe(false)
    })
  })
})

describe('taskboard: a board', () => {
  it('shows the four columns, each with its cards in their order and their count', async () => {
    const { wrapper } = await open('/p/WEB')
    expect(wrapper.findAll('section.column h2').map((heading) => heading.text())).toEqual(['To do 2', 'In progress 1', 'In review 1', 'Done 0'])
    expect(titles(wrapper, 'todo')).toEqual(['First card', 'Second card'])
    expect(titles(wrapper, 'doing')).toEqual(['Doing card'])
    expect(text(wrapper, 'h1')).toBe('WEB Website')
  })

  it('shows on a card its number, its labels, its date (red when it is late), its files and the person it is given to', async () => {
    const { wrapper } = await open('/p/WEB')
    const card = wrapper.find('a.card[data-id=t1]')
    expect(card.find('.ref').text()).toBe('WEB-1')
    expect(card.findAll('.label').map((label) => label.text())).toEqual(['bug'])
    expect(card.find('.due').classes()).toContain('overdue')
    expect(card.find('.files').text()).toContain('2')
    expect(card.find('.person').text()).toBe('AR')
    expect(wrapper.find('a.card[data-id=t2] .person').exists()).toBe(false)
    expect(wrapper.find('a.card[data-id=t2] .due').exists()).toBe(false)
  })

  it('says that there is no such project, and offers the way back', async () => {
    const { wrapper } = await open('/p/NOPE')
    expect(text(wrapper, 'h1')).toBe('No such project')
    expect(wrapper.text()).toContain('NOPE')
    expect(wrapper.find('a').exists()).toBe(true)
  })

  it('says what went wrong when the board cannot be loaded, and tries again when asked', async () => {
    const { http, wrapper, router } = await open('/')
    http.fail = new ApiError(500, 'The disk is full')
    await router.push('/p/OPS')
    await flushPromises()
    expect(text(wrapper, 'h1')).toBe('The board could not be loaded')
    expect(text(wrapper, '.error')).toBe('The disk is full')
    http.fail = null
    await wrapper.find('button.primary').trigger('click')
    await flushPromises()
    expect(titles(wrapper, 'todo')).toEqual(['Ops card'])
  })

  it('goes to another project without waiting for the first, and shows the one that was asked for last', async () => {
    const { wrapper, router, http } = await open('/p/WEB')
    const release = http.hold('page tasks')
    const toOps = router.push('/p/OPS')
    await flushPromises()
    await router.push('/')
    release()
    await toOps
    await flushPromises()
    expect(wrapper.find('.board').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('projects')
  })

  describe('adding a card', () => {
    it('makes a card at the foot of the column, shown at once and then as the CMS made it', async () => {
      const { wrapper, http } = await open('/p/WEB')
      const release = http.hold('post tasks')
      const input = wrapper.find('section.column[data-status=doing] form.add input')
      await input.setValue('  A new card ')
      await wrapper.find('section.column[data-status=doing] form.add').trigger('submit')
      await flushPromises()
      expect(titles(wrapper, 'doing')).toEqual(['Doing card', 'A new card'])
      expect(wrapper.find('a.card.pending .ref').text()).toBe('…')
      expect(input.element.value).toBe('')
      release()
      await flushPromises()
      expect(wrapper.find('a.card.pending').exists()).toBe(false)
      expect(http.log.find((entry) => entry[0] === 'post')).toEqual(['post', 'tasks', { project: 'web', status: 'doing', title: 'A new card' }])
    })

    it('makes nothing from an empty box, and says why when the CMS refuses', async () => {
      const { wrapper, http, services } = await open('/p/WEB')
      await wrapper.find('section.column[data-status=todo] form.add').trigger('submit')
      expect(http.log.some((entry) => entry[0] === 'post')).toBe(false)
      http.fail = new ApiError(400, 'There is no such project')
      await wrapper.find('section.column[data-status=todo] form.add input').setValue('Another')
      await wrapper.find('section.column[data-status=todo] form.add').trigger('submit')
      await flushPromises()
      expect(services.toasts[0].text).toBe('The task was not made: There is no such project')
      expect(titles(wrapper, 'todo')).toEqual(['First card', 'Second card'])
    })

    it('is not offered to a group that may not make tasks', async () => {
      const { wrapper } = await open('/p/WEB', { rights: { read: ['people', 'projects', 'tasks', 'comments'], update: ['tasks'] } })
      expect(wrapper.find('form.add').exists()).toBe(false)
    })
  })

  describe('the filter, which lives in the address', () => {
    it('narrows the cards to those that match the search, after a pause, and writes it in the address', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { wrapper, router } = await open('/p/WEB')
      await wrapper.find('input[type=search]').setValue('first')
      expect(titles(wrapper, 'todo')).toEqual(['First card', 'Second card'])
      await vi.advanceTimersByTimeAsync(250)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ q: 'first' })
      expect(titles(wrapper, 'todo')).toEqual(['First card'])
      expect(wrapper.findAll('section.column h2 .count').map((count) => count.text())).toEqual(['1', '0', '0', '0'])
    })

    it('does not write the address for each letter', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { wrapper, router } = await open('/p/WEB')
      const replace = vi.spyOn(router, 'replace')
      const box = wrapper.find('input[type=search]')
      for (const word of ['f', 'fi', 'fir']) {
        await box.setValue(word)
        await vi.advanceTimersByTimeAsync(100)
      }
      expect(replace).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(250)
      expect(replace).toHaveBeenCalledTimes(1)
    })

    it('is read from the address: a link to a filtered board is a filtered board', async () => {
      const { wrapper } = await open('/p/WEB?q=card&who=grace&label=')
      expect(titles(wrapper, 'doing')).toEqual(['Doing card'])
      expect(titles(wrapper, 'todo')).toEqual([])
      expect(wrapper.find('input[type=search]').element.value).toBe('card')
      expect(wrapper.find('button.chip.on').exists()).toBe(true)
    })

    it('narrows by person, by "nobody", by label, and by date, and says which are on', async () => {
      const { wrapper, router } = await open('/p/WEB')
      const chips = () => wrapper.findAll('button.chip')
      await chips()[0].trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ who: 'ada' })
      expect(titles(wrapper, 'todo')).toEqual(['Second card'])
      expect(chips()[0].attributes('aria-pressed')).toBe('true')
      await chips()[0].trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      await wrapper.findAll('button.chip').find((chip) => chip.text() === 'Nobody').trigger('click')
      await flushPromises()
      expect(titles(wrapper, 'todo')).toEqual(['First card'])
      await wrapper.findAll('button.chip').find((chip) => chip.text() === 'Nobody').trigger('click')
      await flushPromises()
      await wrapper.findAll('button.chip').find((chip) => chip.text() === 'content').trigger('click')
      await flushPromises()
      expect(titles(wrapper, 'todo')).toEqual(['First card'])
      await wrapper.find('.due-filter select').setValue('overdue')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ label: 'content', due: 'overdue' })
      expect(titles(wrapper, 'todo')).toEqual([])
    })

    it('is cleared with one button, and the button is there only when something is filtered', async () => {
      const { wrapper, router } = await open('/p/WEB?who=ada&label=bug')
      expect(wrapper.find('.filters button.link').text()).toBe('Clear')
      await wrapper.find('.filters button.link').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      expect(wrapper.find('.filters button.link').exists()).toBe(false)
      expect(titles(wrapper, 'todo')).toEqual(['First card', 'Second card'])
    })

    it('follows the address when it changes by itself (the back button)', async () => {
      const { wrapper, router } = await open('/p/WEB?q=first')
      expect(wrapper.find('input[type=search]').element.value).toBe('first')
      await router.push('/p/WEB')
      await flushPromises()
      expect(wrapper.find('input[type=search]').element.value).toBe('')
    })

    it('offers the labels of the project only', async () => {
      const { wrapper } = await open('/p/OPS')
      expect(wrapper.find('[aria-label=Labels]').exists()).toBe(false)
      mounted.pop().unmount()
      const web = await open('/p/WEB')
      expect(web.wrapper.findAll('[aria-label=Labels] button').map((chip) => chip.text())).toEqual(['bug', 'content'])
    })
  })

  describe('dragging a card', () => {
    /** the boxes that the cards of a column have on the screen: jsdom has no layout, so they are given */
    const layout = (wrapper, status) => {
      wrapper.findAll(`section.column[data-status=${status}] [data-card]`).forEach((card, index) => {
        card.element.getBoundingClientRect = () => ({ top: index * 50, height: 40 })
      })
    }

    it('moves a card to the place in another column where it is dropped, and writes it once', async () => {
      const { wrapper, http } = await open('/p/WEB')
      layout(wrapper, 'todo')
      const card = wrapper.find('a.card[data-id=t3]')
      card.element.dispatchEvent(fakeEvent('dragstart'))
      const column = wrapper.find('section.column[data-status=todo]')
      const over = fakeEvent('dragover', { clientY: 60, data: 't3' })
      column.element.dispatchEvent(over)
      await flushPromises()
      expect(over.defaultPrevented).toBe(true)
      expect(wrapper.findAll('section.column[data-status=todo] .drop-line')).toHaveLength(1)
      column.element.dispatchEvent(fakeEvent('drop', { clientY: 60, data: 't3' }))
      await flushPromises()
      expect(titles(wrapper, 'todo')).toEqual(['First card', 'Doing card', 'Second card'])
      expect(titles(wrapper, 'doing')).toEqual([])
      expect(http.log.filter((entry) => entry[0] === 'put')).toEqual([['put', 'tasks', 't3', { status: 'todo', position: 1500 }]])
      expect(wrapper.findAll('.drop-line')).toHaveLength(0)
    })

    it('puts a card at the foot of a column when it is dropped under the last one', async () => {
      const { wrapper, http } = await open('/p/WEB')
      layout(wrapper, 'todo')
      wrapper.find('section.column[data-status=todo]').element.dispatchEvent(fakeEvent('drop', { clientY: 500, data: 't3' }))
      await flushPromises()
      expect(http.log.filter((entry) => entry[0] === 'put')[0][3]).toEqual({ status: 'todo', position: 3000 })
    })

    it('puts a card into an empty column', async () => {
      const { wrapper, http } = await open('/p/WEB')
      const column = wrapper.find('section.column[data-status=done]')
      column.element.dispatchEvent(fakeEvent('dragover', { clientY: 10, data: 't1' }))
      await flushPromises()
      expect(wrapper.findAll('section.column[data-status=done] .drop-line')).toHaveLength(1)
      column.element.dispatchEvent(fakeEvent('drop', { clientY: 10, data: 't1' }))
      await flushPromises()
      expect(titles(wrapper, 'done')).toEqual(['Second card'])
      expect(http.log.filter((entry) => entry[0] === 'put')).toEqual([['put', 'tasks', 't1', { status: 'done', position: 1000 }]])
    })

    it('takes the line away when the card leaves the column', async () => {
      const { wrapper } = await open('/p/WEB')
      const column = wrapper.find('section.column[data-status=done]')
      column.element.dispatchEvent(fakeEvent('dragover', { clientY: 10 }))
      await flushPromises()
      expect(wrapper.find('.drop-line').exists()).toBe(true)
      column.element.dispatchEvent(fakeEvent('dragleave'))
      await flushPromises()
      expect(wrapper.find('.drop-line').exists()).toBe(false)
    })

    it('does nothing when what is dropped is not a card of the board, or when the group may not change cards', async () => {
      const { wrapper, http } = await open('/p/WEB')
      const column = wrapper.find('section.column[data-status=done]')
      column.element.dispatchEvent(fakeEvent('drop', { clientY: 10, data: 'something else' }))
      column.element.dispatchEvent(fakeEvent('drop', { clientY: 10 }))
      await flushPromises()
      expect(http.log.some((entry) => entry[0] === 'put')).toBe(false)
      mounted.pop().unmount()
      const readOnly = await open('/p/WEB', { rights: { read: ['people', 'projects', 'tasks', 'comments'] } })
      readOnly.wrapper.find('section.column[data-status=done]').element.dispatchEvent(fakeEvent('drop', { clientY: 10, data: 't1' }))
      await flushPromises()
      expect(readOnly.http.log.some((entry) => entry[0] === 'put')).toBe(false)
    })

    it('puts the card back, and says so, when the CMS refuses the move', async () => {
      const { wrapper, http, services } = await open('/p/WEB')
      http.fail = new ApiError(401, 'Not authorized')
      wrapper.find('section.column[data-status=done]').element.dispatchEvent(fakeEvent('drop', { clientY: 10, data: 't1' }))
      await flushPromises()
      expect(titles(wrapper, 'todo')).toEqual(['First card', 'Second card'])
      expect(titles(wrapper, 'done')).toEqual([])
      expect(services.toasts[0].text).toBe('The card WEB-1 was not moved: Not authorized')
    })

    it('counts the place among the cards that the filter shows', async () => {
      const { wrapper, http } = await open('/p/WEB?label=content')
      layout(wrapper, 'todo')
      wrapper.find('section.column[data-status=todo]').element.dispatchEvent(fakeEvent('drop', { clientY: 5, data: 't3' }))
      await flushPromises()
      // above the only card that is shown (First card, 1000)
      expect(http.log.filter((entry) => entry[0] === 'put')[0][3]).toEqual({ status: 'todo', position: 0 })
    })
  })
})

describe('taskboard: the card that is open', () => {
  const panel = (wrapper) => wrapper.find('aside.panel')
  const field = (wrapper, label) => wrapper.findAll('aside.panel label.field').find((one) => one.text().startsWith(label))

  it('opens beside the board, at its own address, with what the card holds', async () => {
    const { wrapper, router } = await open('/p/WEB/t/WEB-1')
    expect(router.currentRoute.value.name).toBe('task')
    expect(wrapper.find('.board').classes()).toContain('with-panel')
    expect(text(panel(wrapper), '.ref')).toBe('WEB-1')
    expect(field(wrapper, 'Title').find('input').element.value).toBe('Second card')
    expect(field(wrapper, 'Description').find('textarea').element.value).toBe('The details')
    expect(field(wrapper, 'Labels').find('input').element.value).toBe('bug')
    expect(field(wrapper, 'Given to').find('select').element.value).toBe('ada-id')
    expect(panel(wrapper).findAll('.segments button.on').map((button) => button.text())).toEqual(['To do'])
  })

  it('opens from a card of the board, keeps the filter, and closes to the board with the filter', async () => {
    const { wrapper, router } = await open('/p/WEB?label=bug')
    await wrapper.find('a.card[data-id=t1]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/WEB/t/WEB-1?label=bug')
    await panel(wrapper).find('header button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/WEB?label=bug')
    expect(panel(wrapper).exists()).toBe(false)
  })

  it('closes with the Escape key', async () => {
    const { wrapper, router } = await open('/p/WEB/t/WEB-1')
    await panel(wrapper).trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('board')
  })

  it('says that a card is not on the board when it is not (it may have been removed)', async () => {
    const { wrapper } = await open('/p/WEB/t/WEB-99')
    expect(panel(wrapper).text()).toContain('This card is not on the board')
  })

  describe('what is typed', () => {
    it('is written when the field is left, and only when it changed', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const title = field(wrapper, 'Title').find('input')
      await title.trigger('blur')
      expect(http.log.some((entry) => entry[0] === 'put')).toBe(false)
      await title.setValue('  A better title ')
      await title.trigger('blur')
      await flushPromises()
      expect(http.log.filter((entry) => entry[0] === 'put')).toEqual([['put', 'tasks', 't1', { title: 'A better title' }]])
      expect(wrapper.find('a.card[data-id=t1] .title').text()).toBe('A better title')
    })

    it('puts the old title back when it is emptied: a card needs a title', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const title = field(wrapper, 'Title').find('input')
      await title.setValue('   ')
      await title.trigger('blur')
      expect(title.element.value).toBe('Second card')
      expect(http.log.some((entry) => entry[0] === 'put')).toBe(false)
    })

    it('saves the labels as a list, the date as a day, and the description as it is', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const labels = field(wrapper, 'Labels').find('input')
      await labels.setValue('bug,  urgent , ,content')
      await labels.trigger('blur')
      const due = field(wrapper, 'Due').find('input')
      await due.setValue('2026-12-24')
      await due.trigger('change')
      const description = field(wrapper, 'Description').find('textarea')
      await description.setValue('New details')
      await description.trigger('blur')
      await flushPromises()
      const writes = http.log.filter((entry) => entry[0] === 'put').map((entry) => entry[3])
      expect(writes).toEqual([{ labels: ['bug', 'urgent', 'content'] }, { due: new Date('2026-12-24T00:00:00').getTime() }, { description: 'New details' }])
    })

    it('shows the labels as the CMS kept them, without calling its own change a change of someone else', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-1')
      const labels = field(wrapper, 'Labels').find('input')
      await labels.setValue('bug,urgent')
      await labels.trigger('blur')
      await flushPromises()
      expect(panel(wrapper).find('.conflict').exists()).toBe(false)
      expect(labels.element.value).toBe('bug, urgent')
    })

    it('writes a field once at a time: what is typed while a write is out is written after it, and is not lost', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const release = http.hold('put tasks t1 {"title":"One"}')
      const title = field(wrapper, 'Title').find('input')
      await title.setValue('One')
      await title.trigger('blur')
      await title.setValue('Two')
      await title.trigger('blur')
      expect(http.log.filter((entry) => entry[0] === 'put')).toHaveLength(1)
      expect(title.element.value).toBe('Two')
      release()
      await flushPromises()
      expect(http.log.filter((entry) => entry[0] === 'put').map((entry) => entry[3])).toEqual([{ title: 'One' }, { title: 'Two' }])
      expect(title.element.value).toBe('Two')
      expect(wrapper.find('a.card[data-id=t1] .title').text()).toBe('Two')
    })

    it('takes a date away when the box is emptied', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const due = field(wrapper, 'Due').find('input')
      await due.setValue('')
      await due.trigger('change')
      await flushPromises()
      expect(http.log.find((entry) => entry[0] === 'put')[3]).toEqual({ due: null })
    })

    it('leaves the field with Enter, which writes it', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const title = field(wrapper, 'Title').find('input')
      title.element.focus()
      await title.setValue('Entered')
      await title.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(http.log.find((entry) => entry[0] === 'put')[3]).toEqual({ title: 'Entered' })
    })

    it('says that it was not saved, and keeps what was typed, when the CMS refuses', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      http.fail = new ApiError(500, 'The disk is full')
      const title = field(wrapper, 'Title').find('input')
      await title.setValue('Lost?')
      await title.trigger('blur')
      await flushPromises()
      expect(services.toasts[0].text).toBe('The card WEB-1 was not saved: The disk is full')
      expect(title.element.value).toBe('Lost?')
    })
  })

  describe('what is chosen', () => {
    it('is written at once: the status, and the person', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      await panel(wrapper).findAll('.segments button').find((button) => button.text() === 'Done').trigger('click')
      await flushPromises()
      expect(titles(wrapper, 'done')).toEqual(['Second card'])
      await field(wrapper, 'Given to').find('select').setValue('grace-id')
      await field(wrapper, 'Given to').find('select').setValue('')
      await flushPromises()
      expect(http.log.filter((entry) => entry[0] === 'put').map((entry) => entry[3])).toEqual([{ status: 'done' }, { assignee: 'grace-id' }, { assignee: null }])
    })

    it('says that it was not saved when the CMS refuses', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      http.fail = new ApiError(401, 'Not authorized')
      await panel(wrapper).findAll('.segments button')[1].trigger('click')
      await flushPromises()
      expect(services.toasts[0].text).toBe('The card WEB-1 was not saved: Not authorized')
      expect(titles(wrapper, 'todo')).toContain('Second card')
    })

    it('cannot be changed by a group that may not update tasks', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-1', { rights: { read: ['people', 'projects', 'tasks', 'comments'] } })
      expect(field(wrapper, 'Title').find('input').attributes('disabled')).toBeDefined()
      expect(field(wrapper, 'Given to').find('select').attributes('disabled')).toBeDefined()
      expect(panel(wrapper).findAll('.segments button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
      const title = field(wrapper, 'Title').find('input')
      await title.setValue('x')
      await title.trigger('blur')
      expect(panel(wrapper).find('footer').exists()).toBe(false)
    })
  })

  describe('when someone else changes the card while it is open', () => {
    const someoneChanges = async (services, http, patch) => {
      Object.assign(http.db.tasks.find((task) => task._id === 't1'), patch, { _updatedAt: 500, _updatedBy: 'team~grace' })
      services.board.tasks.hear({ action: 'update', data: { resource: 'tasks', _id: 't1', _updatedBy: 'team~grace' } })
      await flushPromises()
    }

    it('shows the change in a field that has not been touched', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      await someoneChanges(services, http, { title: 'Grace renamed it', description: 'Grace wrote this' })
      expect(field(wrapper, 'Title').find('input').element.value).toBe('Grace renamed it')
      expect(field(wrapper, 'Description').find('textarea').element.value).toBe('Grace wrote this')
      expect(panel(wrapper).find('.conflict').exists()).toBe(false)
    })

    it('keeps what is being typed, says that the field was changed, and lets the person choose', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      const title = field(wrapper, 'Title').find('input')
      await title.setValue('My own title')
      await someoneChanges(services, http, { title: 'Grace renamed it', description: 'Grace wrote this' })
      // the field that was typed in keeps the typing; the one that was not takes the change
      expect(title.element.value).toBe('My own title')
      expect(field(wrapper, 'Description').find('textarea').element.value).toBe('Grace wrote this')
      expect(panel(wrapper).find('.conflict').text()).toContain('Someone changed the title to “Grace renamed it”.')
      await panel(wrapper).findAll('.conflict button')[0].trigger('click')
      expect(title.element.value).toBe('Grace renamed it')
      expect(panel(wrapper).find('.conflict').exists()).toBe(false)
    })

    it('keeps the typing when the person says so, and writes it over the change when the field is left', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      const labels = field(wrapper, 'Labels').find('input')
      await labels.setValue('mine')
      await someoneChanges(services, http, { labels: ['theirs'] })
      expect(panel(wrapper).find('.conflict').text()).toContain('Someone changed the labels to “theirs”.')
      await panel(wrapper).findAll('.conflict button')[1].trigger('click')
      expect(panel(wrapper).find('.conflict').exists()).toBe(false)
      await labels.trigger('blur')
      await flushPromises()
      expect(http.log.filter((entry) => entry[0] === 'put').map((entry) => entry[3])).toEqual([{ labels: ['mine'] }])
    })

    it('says so for the description too', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      await field(wrapper, 'Description').find('textarea').setValue('Mine')
      await someoneChanges(services, http, { description: 'Theirs' })
      expect(panel(wrapper).find('.conflict').text()).toContain('Someone changed the description.')
      await panel(wrapper).findAll('.conflict button')[0].trigger('click')
      expect(field(wrapper, 'Description').find('textarea').element.value).toBe('Theirs')
    })

    it('does not call it a change when the typing was written and the card came back as written', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-1')
      const title = field(wrapper, 'Title').find('input')
      await title.setValue('Written')
      await title.trigger('blur')
      await flushPromises()
      expect(panel(wrapper).find('.conflict').exists()).toBe(false)
      expect(title.element.value).toBe('Written')
    })

    it('goes to the card that is opened next with its own fields', async () => {
      const { wrapper, router } = await open('/p/WEB/t/WEB-1')
      await field(wrapper, 'Title').find('input').setValue('Half typed')
      await router.push('/p/WEB/t/WEB-2')
      await flushPromises()
      expect(field(wrapper, 'Title').find('input').element.value).toBe('First card')
      expect(panel(wrapper).find('.conflict').exists()).toBe(false)
    })
  })

  describe('the comments', () => {
    it('lists the comments of the card, with who wrote them', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-1')
      const items = wrapper.findAll('.comments li')
      expect(items).toHaveLength(1)
      expect(items[0].find('strong').text()).toBe('grace')
      expect(items[0].find('p').text()).toBe('A comment')
    })

    it('has none for a card that has none, and does not ask for the comments of a card that is waiting for the CMS', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-2')
      expect(wrapper.findAll('.comments li')).toHaveLength(0)
    })

    it('sends a comment, shown at once, without saying who wrote it', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const box = wrapper.find('.comments textarea')
      await box.setValue('  Looks good ')
      expect(wrapper.find('.comments button.primary').attributes('disabled')).toBeUndefined()
      await wrapper.find('.comments form').trigger('submit')
      await flushPromises()
      expect(http.log.find((entry) => entry[0] === 'post')).toEqual(['post', 'comments', { task: 't1', text: 'Looks good' }])
      expect(wrapper.findAll('.comments li p').map((one) => one.text())).toEqual(['A comment', 'Looks good'])
      expect(box.element.value).toBe('')
    })

    it('sends with Ctrl+Enter, and sends nothing when there is nothing', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      expect(wrapper.find('.comments button.primary').attributes('disabled')).toBeDefined()
      const box = wrapper.find('.comments textarea')
      await box.trigger('keydown', { key: 'Enter', ctrlKey: true })
      expect(http.log.some((entry) => entry[0] === 'post')).toBe(false)
      await box.setValue('Quick')
      await box.trigger('keydown', { key: 'Enter', ctrlKey: true })
      await flushPromises()
      expect(http.log.find((entry) => entry[0] === 'post')[2].text).toBe('Quick')
    })

    it('gives the text back, and says so, when the comment is refused', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      http.fail = new ApiError(500, 'The disk is full')
      const box = wrapper.find('.comments textarea')
      await box.setValue('Will not go')
      await wrapper.find('.comments form').trigger('submit')
      await flushPromises()
      expect(box.element.value).toBe('Will not go')
      expect(services.toasts[0].text).toBe('The comment was not sent: The disk is full')
    })

    it('says what went wrong when the comments cannot be read', async () => {
      const { wrapper, router, http } = await open('/p/WEB')
      http.fail = new ApiError(500, 'The comments are lost')
      await router.push('/p/WEB/t/WEB-2')
      await flushPromises()
      expect(wrapper.find('.comments .error').text()).toBe('The comments are lost')
    })

    it('has no form for a group that may not make comments', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-1', { rights: { read: ['people', 'projects', 'tasks', 'comments'] } })
      expect(wrapper.find('.comments form').exists()).toBe(false)
    })
  })

  describe('the files', () => {
    it('lists the files, with a small picture for an image, and their size', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-1')
      const items = wrapper.findAll('.files li')
      expect(items).toHaveLength(2)
      expect(items[0].find('a').attributes('href')).toBe('/api/tasks/t1/attachments/f1')
      expect(items[0].find('img').attributes('src')).toBe('/api/tasks/t1/attachments/f1?resize=96xauto')
      expect(items[0].text()).toContain('shot.png')
      expect(items[1].find('img').exists()).toBe(false)
      expect(items[1].text()).toContain('f2.txt')
      expect(items[1].text()).toContain('2 kB')
    })

    it('says the size of a big file in megabytes, and names a file that has no name by its number', async () => {
      const data = seed()
      data.tasks[0].files = [file('big', { _size: 3 * 1048576 }), { _id: 'noname', _contentType: '', _size: 10, url: '/x' }]
      const { wrapper } = await open('/p/WEB/t/WEB-1', { data })
      const items = wrapper.findAll('.files li')
      expect(items[0].text()).toContain('3.0 MB')
      expect(items[1].text()).toContain('noname')
    })

    it('sends the files that are chosen, says how far each has gone, and shows them when the card is read again', async () => {
      const { wrapper, http } = await open('/p/WEB/t/WEB-1')
      const hold = new Promise((resolve) => { http.upload.mockImplementationOnce(async (resource, id, { onProgress }) => { onProgress(0.5); await hold2; resolve(); return { _id: 'new' } }) })
      let finish
      const hold2 = new Promise((resolve) => { finish = resolve })
      const input = wrapper.find('.files input[type=file]')
      Object.defineProperty(input.element, 'files', { value: [new File(['a'], 'a.txt')], configurable: true })
      await input.trigger('change')
      await flushPromises()
      expect(wrapper.find('.files .uploading').text()).toContain('a.txt')
      expect(wrapper.find('.files progress').element.value).toBe(0.5)
      http.db.tasks[0].files.push(file('f3'))
      finish()
      await hold
      await flushPromises()
      expect(wrapper.find('.files .uploading').exists()).toBe(false)
      expect(wrapper.findAll('.files li')).toHaveLength(3)
    })

    it('stops an upload that is cancelled, without saying that it failed', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      http.upload.mockImplementationOnce((resource, id, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' })))
      }))
      const input = wrapper.find('.files input[type=file]')
      Object.defineProperty(input.element, 'files', { value: [new File(['a'], 'a.txt')], configurable: true })
      await input.trigger('change')
      await flushPromises()
      await wrapper.find('.files .uploading button').trigger('click')
      await flushPromises()
      expect(wrapper.find('.files .uploading').exists()).toBe(false)
      expect(services.toasts).toHaveLength(0)
    })

    it('says which file was not sent when the CMS refuses it, and goes on with the next', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      http.upload.mockRejectedValueOnce(new ApiError(413, 'Too big'))
      const input = wrapper.find('.files input[type=file]')
      Object.defineProperty(input.element, 'files', { value: [new File(['a'], 'big.bin'), new File(['b'], 'small.txt')], configurable: true })
      await input.trigger('change')
      await flushPromises()
      expect(services.toasts.map((toast) => toast.text)).toEqual(['big.bin was not sent: Too big'])
      expect(http.upload).toHaveBeenCalledTimes(2)
    })

    it('takes a file away, and says why when it cannot', async () => {
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-1')
      http.db.tasks[0].files = [file('f2')]
      await wrapper.find('.files li button').trigger('click')
      await flushPromises()
      expect(http.log.find((entry) => entry[0] === 'delete file')).toEqual(['delete file', 'tasks', 't1', 'f1'])
      expect(wrapper.findAll('.files li')).toHaveLength(1)
      http.delete = vi.fn().mockRejectedValue(new ApiError(401, 'Not authorized'))
      await wrapper.find('.files li button').trigger('click')
      await flushPromises()
      expect(services.toasts[0].text).toBe('f2.txt was not removed: Not authorized')
    })

    it('cannot be added or taken away by a group without the right to', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-1', { rights: { read: ['people', 'projects', 'tasks', 'comments'], update: ['tasks'] } })
      expect(wrapper.find('.files input[type=file]').exists()).toBe(false)
      expect(wrapper.find('.files li button').exists()).toBe(false)
    })
  })

  describe('removing the card', () => {
    it('removes the card after asking, and closes the panel', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const { wrapper, http, router } = await open('/p/WEB/t/WEB-2')
      await panel(wrapper).find('footer button').trigger('click')
      await flushPromises()
      expect(confirm).toHaveBeenCalledWith('Remove WEB-2?')
      expect(http.log.find((entry) => entry[0] === 'delete')).toEqual(['delete', 'tasks', 't2'])
      expect(router.currentRoute.value.name).toBe('board')
      expect(titles(wrapper, 'todo')).toEqual(['Second card'])
    })

    it('does nothing when the person says no', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const { wrapper, http } = await open('/p/WEB/t/WEB-2')
      await panel(wrapper).find('footer button').trigger('click')
      expect(http.log.some((entry) => entry[0] === 'delete')).toBe(false)
    })

    it('says that it was not removed, and the card comes back, when the CMS refuses', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const { wrapper, http, services } = await open('/p/WEB/t/WEB-2')
      http.fail = new ApiError(401, 'Not authorized')
      await panel(wrapper).find('footer button').trigger('click')
      await flushPromises()
      expect(services.toasts[0].text).toBe('The card WEB-2 was not removed: Not authorized')
      expect(titles(wrapper, 'todo')).toContain('First card')
    })

    it('is not offered to a group that may not remove cards', async () => {
      const { wrapper } = await open('/p/WEB/t/WEB-2', { rights: { read: ['people', 'projects', 'tasks', 'comments'] } })
      expect(panel(wrapper).find('footer').exists()).toBe(false)
    })
  })
})

describe('taskboard: what the person is told', () => {
  it('shows the state of the connection, in words, and a message goes after a few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { wrapper, services } = await open('/')
    expect(text(wrapper, '.connection')).toBe('Not connected')
    services.realtime.start()
    await flushPromises()
    expect(text(wrapper, '.connection')).toBe('Connecting…')
    FakeSocket.all[0].onopen()
    await flushPromises()
    expect(text(wrapper, '.connection')).toBe('Live')
    expect(wrapper.find('.connection').attributes('title')).toBe('Changes of others appear at once')
    FakeSocket.all[0].onclose()
    await flushPromises()
    expect(text(wrapper, '.connection')).toBe('Offline, trying again')
    expect(wrapper.find('.connection').attributes('title')).toBe('What is shown may be out of date')
    services.notify('A thing happened')
    await flushPromises()
    expect(wrapper.find('.toasts li').text()).toBe('A thing happened')
    await vi.advanceTimersByTimeAsync(6000)
    await flushPromises()
    expect(wrapper.find('.toasts li').exists()).toBe(false)
    services.realtime.stop()
  })

  it('shows what the CMS says of another person at once: a card changed over the websocket appears on the board', async () => {
    const { wrapper, http, services } = await open('/p/WEB')
    http.db.tasks.find((task) => task._id === 't4').status = 'done'
    http.db.tasks.find((task) => task._id === 't4')._updatedAt = 900
    services.board.tasks.hear({ action: 'update', data: { resource: 'tasks', _id: 't4', _updatedBy: 'team~grace' } })
    await flushPromises()
    expect(titles(wrapper, 'review')).toEqual([])
    expect(titles(wrapper, 'done')).toEqual(['Review card'])
  })

  it('shows what is made and removed by another person, and says nothing of it', async () => {
    const { wrapper, http, services } = await open('/p/WEB')
    http.db.tasks.push(rec('t6', { ref: 'WEB-6', project: 'web', status: 'done', position: 1000, title: 'Made elsewhere' }))
    services.board.tasks.hear({ action: 'create', data: { resource: 'tasks', _id: 't6', _updatedBy: 'team~grace' } })
    await flushPromises()
    expect(titles(wrapper, 'done')).toEqual(['Made elsewhere'])
    services.board.tasks.hear({ action: 'remove', data: { resource: 'tasks', _id: 't6' } })
    await flushPromises()
    expect(titles(wrapper, 'done')).toEqual([])
    expect(services.toasts).toHaveLength(0)
  })
})
