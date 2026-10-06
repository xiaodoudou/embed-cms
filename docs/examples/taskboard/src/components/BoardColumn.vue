<script setup>
// A column of the board: its cards, the place a dragged card would fall in (a line), and a box to add a card at the foot. It does not move anything: it says "this card,
// at this place" and the board writes.
import { ref } from 'vue'
import { dropIndex } from '../lib/position'
import TaskCard from './TaskCard.vue'

defineProps({
  status: { type: Object, required: true },
  cards: { type: Array, required: true },
  projectKey: { type: String, required: true },
  personOf: { type: Function, required: true },
  query: { type: Object, default: () => ({}) },
  canAdd: { type: Boolean, default: true }
})
const emit = defineEmits(['drop', 'add'])

const body = ref(null)
/** where the dragged card would fall; null when nothing is dragged over */
const over = ref(null)
const title = ref('')

function indexAt (y) {
  const rects = [...body.value.querySelectorAll('[data-card]')].map((element) => element.getBoundingClientRect())
  return dropIndex(rects, y)
}

function dragover (event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  over.value = indexAt(event.clientY)
}

function drop (event) {
  event.preventDefault()
  const id = event.dataTransfer.getData('text/plain')
  const index = indexAt(event.clientY)
  over.value = null
  if (id) {
    emit('drop', { id, index })
  }
}

function add () {
  const text = title.value.trim()
  if (text) {
    emit('add', text)
    title.value = ''
  }
}
</script>

<template>
  <section class="column" :aria-label="status.label" :data-status="status.value" @dragover="dragover" @dragleave.self="over = null" @drop="drop">
    <h2>{{ status.label }} <span class="count">{{ cards.length }}</span></h2>
    <div ref="body" class="cards">
      <template v-for="(task, index) in cards" :key="task._id">
        <div v-if="over === index" class="drop-line" />
        <TaskCard :task="task" :person="personOf(task.assignee)" :project-key="projectKey" :query="query" />
      </template>
      <div v-if="over !== null && over >= cards.length" class="drop-line" />
    </div>
    <form v-if="canAdd" class="add" @submit.prevent="add">
      <input v-model="title" type="text" maxlength="200" :aria-label="`Add a task to ${status.label}`" placeholder="Add a task">
    </form>
  </section>
</template>
