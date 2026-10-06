<script setup>
// The frame of every screen: the name, the way to the projects, who is signed in, the state of the connection, and the messages.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectionBadge from './components/ConnectionBadge.vue'
import ToastList from './components/ToastList.vue'
import { useServices } from './services'

const { session, realtime } = useServices()
const route = useRoute()
const router = useRouter()
const signedIn = computed(() => Boolean(session.state.user))

async function signOut () {
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <header class="bar">
    <RouterLink class="brand" :to="{ name: 'projects' }">Boardwalk</RouterLink>
    <nav v-if="signedIn" aria-label="Main">
      <RouterLink :to="{ name: 'projects' }" :class="{ active: route.name === 'projects' }">Projects</RouterLink>
    </nav>
    <span class="spacer" />
    <ConnectionBadge v-if="signedIn" :status="realtime.status.value" />
    <template v-if="signedIn">
      <span class="who">{{ session.state.user.username }}</span>
      <button type="button" class="link" @click="signOut">Sign out</button>
    </template>
  </header>
  <main>
    <RouterView />
  </main>
  <ToastList />
</template>
