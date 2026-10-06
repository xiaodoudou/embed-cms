<script setup>
// The sign-in: an account of the CMS and its password. The CMS answers with a cookie that this page cannot read; the router then lets the person in.
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useServices } from '../services'

const { session } = useServices()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

/** @returns {string} where to go: back to where the person was, if it is a page of this app, and the projects otherwise */
const destination = () => {
  const wanted = String(route.query.redirect || '')
  return /^\/(?![/\\])/.test(wanted) ? wanted : '/'
}

async function submit () {
  busy.value = true
  error.value = ''
  try {
    await session.login(username.value.trim(), password.value)
    await router.replace(destination())
  } catch (caught) {
    error.value = caught.message
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="login">
    <h1>Sign in</h1>
    <p class="lede">Use the account that the CMS gave you.</p>
    <form @submit.prevent="submit">
      <label>Account <input v-model="username" name="username" autocomplete="username" required autofocus></label>
      <label>Password <input v-model="password" name="password" type="password" autocomplete="current-password" required></label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </section>
</template>
