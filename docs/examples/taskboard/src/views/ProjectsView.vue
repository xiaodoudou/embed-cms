<script setup>
// The projects: a board each. A new one needs a name and a key (capital letters: it is what the tasks are numbered with).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useServices } from '../services'

const { board, session, notify } = useServices()
const router = useRouter()
const name = ref('')
const key = ref('')
const failed = ref('')

const projects = computed(() => [...board.projects.list.value].filter((project) => !project.archived).sort((a, b) => a.name.localeCompare(b.name)))
const canCreate = computed(() => session.can('create', 'projects'))
const keyIsValid = computed(() => /^[A-Z]{2,5}$/.test(key.value))
const taken = computed(() => Boolean(board.projectByKey(key.value)))

onMounted(() => board.projects.load().catch((error) => { failed.value = error.message }))

async function create () {
  if (!keyIsValid.value || taken.value || !name.value.trim()) {
    return
  }
  try {
    const project = await board.addProject({ name: name.value.trim(), key: key.value })
    name.value = ''
    key.value = ''
    await router.push({ name: 'board', params: { key: project.key } })
  } catch (error) {
    notify(`The project was not made: ${error.message}`)
  }
}
</script>

<template>
  <section class="projects">
    <h1>Projects</h1>
    <p v-if="failed" class="error" role="alert">{{ failed }}</p>
    <ul class="project-list">
      <li v-for="project in projects" :key="project._id">
        <RouterLink :to="{ name: 'board', params: { key: project.key } }">
          <span class="key">{{ project.key }}</span>
          <strong>{{ project.name }}</strong>
          <span class="description">{{ project.description }}</span>
        </RouterLink>
      </li>
    </ul>
    <p v-if="!projects.length && board.projects.loaded.value">There is no project yet.</p>
    <form v-if="canCreate" class="new-project" @submit.prevent="create">
      <h2>New project</h2>
      <label>Name <input v-model="name" maxlength="80" required></label>
      <label>Key <input v-model="key" maxlength="5" placeholder="WEB" pattern="[A-Z]{2,5}" required @input="key = key.toUpperCase()"></label>
      <p v-if="key && !keyIsValid" class="hint">Two to five capital letters.</p>
      <p v-else-if="taken" class="error">This key is used.</p>
      <button type="submit" class="primary" :disabled="!keyIsValid || taken || !name.trim()">Make the project</button>
    </form>
  </section>
</template>
