<script setup>
// One card, opened beside the board (at /p/WEB/t/WEB-3). Its fields are edited in a draft and written when the field is left; the status, the person and the labels are written at once.
// Because other people use the board too, a card can change while it is open: a field that nobody here has touched takes the new value; a field that is being edited does not
// lose what was typed, it says that someone else changed it, and lets the person choose.
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isAbort } from '../api/http'
import { STATUSES } from '../stores/board'
import { useServices } from '../services'

const { board, session, notify } = useServices()
const route = useRoute()
const router = useRouter()

const task = computed(() => board.tasks.list.value.find((one) => one.ref === route.params.ref) || null)
const canEdit = computed(() => session.can('update', 'tasks'))
const canAttach = computed(() => session.can('attachments', 'tasks'))
const people = computed(() => board.people.list.value)

// ---------------------------------------------------------------- the fields that are typed: a draft, what it was based on, and what others changed meanwhile

const FIELDS = {
  title: (task) => task.title || '',
  description: (task) => task.description || '',
  labels: (task) => (task.labels || []).join(', '),
  due: (task) => (Number.isFinite(task.due) ? new Date(task.due).toISOString().slice(0, 10) : '')
}
/** @returns {object} what is sent for a field, from what was typed */
const TO_PATCH = {
  title: (text) => ({ title: text.trim() }),
  description: (text) => ({ description: text }),
  labels: (text) => ({ labels: text.split(',').map((label) => label.trim()).filter(Boolean) }),
  due: (text) => ({ due: text ? new Date(`${text}T00:00:00`).getTime() : null })
}
const draft = reactive({ title: '', description: '', labels: '', due: '' })
const base = reactive({ title: '', description: '', labels: '', due: '' })
const conflicts = reactive({})
/** the fields whose write is out: what comes back for them is my own change, not someone else's */
const saving = new Set()

function adopt (current, name) {
  const value = FIELDS[name](current)
  draft[name] = value
  base[name] = value
  delete conflicts[name]
}

// when the card changes (it was loaded, someone saved it, my own save came back): each field takes the new value unless it is being edited
watch(task, (current, previous) => {
  if (!current) {
    return
  }
  const same = previous && previous._id === current._id
  for (const name of Object.keys(FIELDS)) {
    if (saving.has(name)) {
      continue
    }
    const incoming = FIELDS[name](current)
    if (!same || draft[name] === base[name]) {
      adopt(current, name)
    } else if (incoming !== base[name]) {
      // typed here, and changed there: the typing is kept, and the change is shown
      conflicts[name] = incoming
    }
  }
}, { immediate: true })

/** Writes a field that was typed, when it was left. */
async function save (name) {
  // one write of a field at a time: what is typed while it is out is written after it
  if (!canEdit.value || draft[name] === base[name] || !task.value || saving.has(name)) {
    return
  }
  if (name === 'title' && !draft.title.trim()) {
    draft.title = base.title
    return
  }
  const sent = draft[name]
  saving.add(name)
  let saved = false
  try {
    await board.tasks.update(task.value._id, TO_PATCH[name](sent))
    // the field is what the CMS kept (the labels, written as a list, are read back as one): what the draft is based on becomes that, and the draft too unless it was typed in again
    base[name] = FIELDS[name](task.value)
    if (draft[name] === sent) {
      draft[name] = base[name]
    }
    delete conflicts[name]
    saved = true
  } catch (error) {
    notify(`The card ${task.value.ref} was not saved: ${error.message}`)
  } finally {
    saving.delete(name)
  }
  if (saved && draft[name] !== base[name]) {
    await save(name)
  }
}

/** Someone else changed what is being typed here: the person chooses. */
const takeTheirs = (name) => adopt(task.value, name)
const keepMine = (name) => {
  base[name] = conflicts[name]
  delete conflicts[name]
}

// ---------------------------------------------------------------- the fields that are chosen: written at once

async function change (patch) {
  try {
    await board.tasks.update(task.value._id, patch)
  } catch (error) {
    notify(`The card ${task.value.ref} was not saved: ${error.message}`)
  }
}

async function remove () {
  if (!task.value || !window.confirm(`Remove ${task.value.ref}?`)) {
    return
  }
  const { ref, _id } = task.value
  close()
  try {
    await board.tasks.remove(_id)
  } catch (error) {
    notify(`The card ${ref} was not removed: ${error.message}`)
  }
}

const close = () => router.push({ name: 'board', params: { key: route.params.key }, query: route.query })

// ---------------------------------------------------------------- the comments

const text = ref('')
const comments = computed(() => (task.value ? board.commentsOf(task.value._id) : []))
const commentsFailed = ref('')
let controller = null
watch(() => task.value && task.value._id, async (id) => {
  if (controller) {
    controller.abort()
  }
  commentsFailed.value = ''
  if (!id || id.startsWith('pending-')) {
    return
  }
  controller = new AbortController()
  try {
    await board.openTask(id, controller.signal)
  } catch (error) {
    if (!isAbort(error)) {
      commentsFailed.value = error.message
    }
  }
}, { immediate: true })

async function comment () {
  const body = text.value.trim()
  if (!body) {
    return
  }
  text.value = ''
  try {
    await board.addComment(task.value._id, body)
  } catch (error) {
    text.value = body
    notify(`The comment was not sent: ${error.message}`)
  }
}

// ---------------------------------------------------------------- the files

/** The uploads that are going on: a name, how far, and what stops it. */
const uploads = ref([])
const files = computed(() => (task.value && task.value.files) || [])
const isImage = (file) => /^image\//.test(file._contentType || '')
const nameOf = (file) => file._filename || (file._fields && file._fields._filename) || file._id
const sizeOf = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`)

async function pick (event) {
  const chosen = [...event.target.files]
  event.target.value = ''
  for (const blob of chosen) {
    const upload = reactive({ id: `${Date.now()}-${blob.name}`, name: blob.name, progress: 0, controller: new AbortController() })
    uploads.value.push(upload)
    try {
      await board.attach(task.value._id, blob, (done) => { upload.progress = done }, upload.controller.signal)
    } catch (error) {
      if (!isAbort(error)) {
        notify(`${blob.name} was not sent: ${error.message}`)
      }
    } finally {
      uploads.value = uploads.value.filter((one) => one !== upload)
    }
  }
}

async function detach (file) {
  try {
    await board.detach(task.value._id, file._id)
  } catch (error) {
    notify(`${nameOf(file)} was not removed: ${error.message}`)
  }
}
</script>

<template>
  <aside class="panel" aria-label="Task" @keydown.esc="close">
    <template v-if="task">
      <header>
        <span class="ref">{{ task.ref }}</span>
        <button type="button" class="link" aria-label="Close the card" @click="close">Close</button>
      </header>

      <label class="field">Title
        <input v-model="draft.title" :disabled="!canEdit" maxlength="200" @blur="save('title')" @keydown.enter.prevent="$event.target.blur()">
      </label>
      <p v-if="conflicts.title !== undefined" class="conflict" role="alert">
        Someone changed the title to “{{ conflicts.title }}”.
        <button type="button" class="link" @click="takeTheirs('title')">Use it</button>
        <button type="button" class="link" @click="keepMine('title')">Keep mine</button>
      </p>

      <div class="field" role="group" aria-label="Status">
        <span>Status</span>
        <span class="segments">
          <button v-for="status in STATUSES" :key="status.value" type="button" :class="{ on: task.status === status.value }" :aria-pressed="task.status === status.value" :disabled="!canEdit" @click="change({ status: status.value })">{{ status.label }}</button>
        </span>
      </div>

      <label class="field">Given to
        <select :value="task.assignee || ''" :disabled="!canEdit" @change="change({ assignee: $event.target.value || null })">
          <option value="">Nobody</option>
          <option v-for="person in people" :key="person._id" :value="person._id">{{ person.name }}</option>
        </select>
      </label>

      <label class="field">Labels <small>separated by commas</small>
        <input v-model="draft.labels" :disabled="!canEdit" @blur="save('labels')" @keydown.enter.prevent="$event.target.blur()">
      </label>
      <p v-if="conflicts.labels !== undefined" class="conflict" role="alert">
        Someone changed the labels to “{{ conflicts.labels }}”.
        <button type="button" class="link" @click="takeTheirs('labels')">Use them</button>
        <button type="button" class="link" @click="keepMine('labels')">Keep mine</button>
      </p>

      <label class="field">Due
        <input v-model="draft.due" type="date" :disabled="!canEdit" @change="save('due')">
      </label>

      <label class="field">Description
        <textarea v-model="draft.description" rows="5" :disabled="!canEdit" @blur="save('description')" />
      </label>
      <p v-if="conflicts.description !== undefined" class="conflict" role="alert">
        Someone changed the description.
        <button type="button" class="link" @click="takeTheirs('description')">Use theirs</button>
        <button type="button" class="link" @click="keepMine('description')">Keep mine</button>
      </p>

      <section class="files" aria-label="Files">
        <h3>Files</h3>
        <ul>
          <li v-for="file in files" :key="file._id">
            <a :href="file.url" target="_blank" rel="noopener">
              <img v-if="isImage(file)" :src="`${file.url}?resize=96xauto`" alt="" width="48" height="48" loading="lazy">
              {{ nameOf(file) }}
            </a>
            <small>{{ sizeOf(file._size) }}</small>
            <button v-if="canAttach" type="button" class="link" :aria-label="`Remove ${nameOf(file)}`" @click="detach(file)">Remove</button>
          </li>
          <li v-for="upload in uploads" :key="upload.id" class="uploading">
            {{ upload.name }}
            <progress :value="upload.progress" max="1" :aria-label="`Sending ${upload.name}`" />
            <button type="button" class="link" @click="upload.controller.abort()">Cancel</button>
          </li>
        </ul>
        <label v-if="canAttach" class="add-file">Add files <input type="file" multiple @change="pick"></label>
      </section>

      <section class="comments" aria-label="Comments">
        <h3>Comments</h3>
        <p v-if="commentsFailed" class="error" role="alert">{{ commentsFailed }}</p>
        <ol>
          <li v-for="one in comments" :key="one._id" :class="{ pending: one._pending }">
            <strong>{{ one.author || '…' }}</strong>
            <time :datetime="new Date(one._createdAt).toISOString()">{{ new Date(one._createdAt).toLocaleString() }}</time>
            <p>{{ one.text }}</p>
          </li>
        </ol>
        <form v-if="session.can('create', 'comments')" @submit.prevent="comment">
          <textarea v-model="text" rows="2" placeholder="Write a comment" aria-label="Write a comment" @keydown.ctrl.enter="comment" />
          <button type="submit" class="primary" :disabled="!text.trim()">Send</button>
        </form>
      </section>

      <footer v-if="session.can('remove', 'tasks')">
        <button type="button" class="danger" @click="remove">Remove the card</button>
      </footer>
    </template>
    <p v-else class="status">This card is not on the board (it may have been removed).</p>
  </aside>
</template>
