<script setup>
// The board of a project: four columns of cards, narrowed by a filter that lives in the address, and beside it (when the address says so) the panel of one card.
// The screen loads, shows and says what was asked; the records, the order and the writes are the board's (stores/board.js).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isAbort } from '../api/http'
import BoardColumn from '../components/BoardColumn.vue'
import FilterBar from '../components/FilterBar.vue'
import { readFilters, writeFilters } from '../lib/filters'
import { STATUSES } from '../stores/board'
import { useServices } from '../services'

const { board, session, notify } = useServices()
const route = useRoute()
const router = useRouter()

/** 'loading', 'ready', 'missing' (no such project) or 'failed' */
const state = ref('loading')
const failure = ref('')
const project = ref(null)
let controller = null

async function open () {
  // a person who goes from one project to another does not wait for the first: what it was asking for is cancelled
  if (controller) {
    controller.abort()
  }
  controller = new AbortController()
  state.value = 'loading'
  try {
    const found = await board.open(route.params.key, controller.signal)
    project.value = found || null
    state.value = found ? 'ready' : 'missing'
  } catch (error) {
    if (!isAbort(error)) {
      failure.value = error.message
      state.value = 'failed'
    }
  }
}
watch(() => route.params.key, open, { immediate: true })
onBeforeUnmount(() => controller && controller.abort())

const filters = computed(() => readFilters(route.query))
const columns = computed(() => (project.value ? STATUSES.map((status) => ({ status, cards: board.column(project.value._id, status.value, filters.value) })) : []))
const labels = computed(() => (project.value ? board.labelsOf(project.value._id) : []))
const people = computed(() => board.people.list.value)
const canEdit = computed(() => session.can('update', 'tasks'))

/** The filter is written in the address, and the address is read back: that is the whole state. The task that is open stays open. */
const setFilters = (next) => router.replace({ name: route.name, params: route.params, query: writeFilters(next) })
const personOf = (id) => board.people.get(id) || null

async function dropped (status, cards, { id, index }) {
  const task = board.tasks.get(id)
  if (!task || !canEdit.value) {
    return
  }
  try {
    await board.moveTask(id, status.value, cards, index)
  } catch (error) {
    notify(`The card ${task.ref} was not moved: ${error.message}`)
  }
}

async function added (status, title) {
  try {
    await board.addTask(project.value._id, status.value, title)
  } catch (error) {
    notify(`The task was not made: ${error.message}`)
  }
}
</script>

<template>
  <section v-if="state === 'ready'" class="board" :class="{ 'with-panel': route.name === 'task' }">
    <header class="board-head">
      <h1><span class="key">{{ project.key }}</span> {{ project.name }}</h1>
      <FilterBar :filters="filters" :people="people" :labels="labels" @change="setFilters" />
    </header>
    <div class="columns">
      <BoardColumn
        v-for="{ status, cards } in columns"
        :key="status.value"
        :status="status"
        :cards="cards"
        :project-key="project.key"
        :person-of="personOf"
        :query="route.query"
        :can-add="session.can('create', 'tasks')"
        @drop="dropped(status, cards, $event)"
        @add="added(status, $event)"
      />
    </div>
    <RouterView />
  </section>
  <p v-else-if="state === 'loading'" class="status" role="status">Loading the board…</p>
  <section v-else-if="state === 'missing'" class="login">
    <h1>No such project</h1>
    <p class="lede">There is no project with the key {{ route.params.key }}.</p>
    <RouterLink :to="{ name: 'projects' }">Back to the projects</RouterLink>
  </section>
  <section v-else class="login">
    <h1>The board could not be loaded</h1>
    <p class="error" role="alert">{{ failure }}</p>
    <button type="button" class="primary" @click="open">Try again</button>
  </section>
</template>
