<script setup>
// A round badge with the initials of a person, in the colour of the person.
import { computed } from 'vue'

const props = defineProps({ person: { type: Object, default: null } })
const initials = computed(() => (props.person ? props.person.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase() : '?'))
</script>

<template>
  <span class="person" :style="{ background: (person && person.color) || '#9aa0b4' }" :title="person ? person.name : 'Nobody'">{{ initials }}</span>
</template>
