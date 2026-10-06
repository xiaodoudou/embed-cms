<script setup>
// One card of a column. It can be dragged (the column it is dropped in decides where it goes), opened (a click, or Enter), and it says what it is waiting for: `_pending` while the CMS
// has not answered its change yet.
import { computed } from 'vue'
import PersonBadge from './PersonBadge.vue'

const props = defineProps({
  task: { type: Object, required: true },
  person: { type: Object, default: null },
  projectKey: { type: String, required: true },
  query: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['dragstart', 'dragend'])

const overdue = computed(() => Number.isFinite(props.task.due) && props.task.due < Date.now() && props.task.status !== 'done')
const dueText = computed(() => (Number.isFinite(props.task.due) ? new Date(props.task.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''))
const files = computed(() => (props.task.files || []).length)

function start (event) {
  event.dataTransfer.setData('text/plain', props.task._id)
  event.dataTransfer.effectAllowed = 'move'
  emit('dragstart', props.task._id)
}
</script>

<template>
  <RouterLink
    class="card"
    :class="{ pending: task._pending }"
    :to="{ name: 'task', params: { key: projectKey, ref: task.ref || task._id }, query }"
    draggable="true"
    data-card
    :data-id="task._id"
    @dragstart="start"
    @dragend="emit('dragend')"
  >
    <span class="ref">{{ task.ref || '…' }}</span>
    <strong class="title">{{ task.title }}</strong>
    <span v-if="(task.labels || []).length" class="labels">
      <span v-for="label in task.labels" :key="label" class="label">{{ label }}</span>
    </span>
    <span class="meta">
      <span v-if="dueText" class="due" :class="{ overdue }">{{ dueText }}</span>
      <span v-if="files" class="files" :title="`${files} file(s)`">📎 {{ files }}</span>
      <PersonBadge v-if="task.assignee" :person="person" />
    </span>
  </RouterLink>
</template>
