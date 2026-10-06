<script setup>
// The messages: what failed, what was taken back. They go by themselves.
import { useServices } from '../services'

const { toasts } = useServices()
</script>

<template>
  <ul class="toasts" aria-live="polite">
    <li v-for="toast in toasts" :key="toast.id">{{ toast.text }}</li>
  </ul>
</template>
