<script setup>
// Whether the board hears what others do: a dot and a word. It is not decoration: when it is not green, what is on the screen may be old.
import { computed } from 'vue'

const props = defineProps({ status: { type: String, required: true } })
const label = computed(() => ({
  open: 'Live',
  connecting: 'Connecting…',
  waiting: 'Offline, trying again',
  closed: 'Not connected'
})[props.status] || props.status)
</script>

<template>
  <span class="connection" :class="status" role="status" :title="status === 'open' ? 'Changes of others appear at once' : 'What is shown may be out of date'">
    <i aria-hidden="true" />{{ label }}
  </span>
</template>
