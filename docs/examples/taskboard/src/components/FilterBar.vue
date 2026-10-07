<script setup>
// What narrows the cards. It does not keep the filter: it shows the one it is given (which comes from the address) and says the one that is wanted. Typing in the search box
// waits for a pause, so that a word is not an address change for each letter.
import { onBeforeUnmount, ref, watch } from 'vue'
import { isEmpty } from '../lib/filters'
import PersonBadge from './PersonBadge.vue'

const props = defineProps({
  filters: { type: Object, required: true },
  people: { type: Array, required: true },
  labels: { type: Array, required: true }
})
const emit = defineEmits(['change'])

const text = ref(props.filters.text)
let timer = null
// the address changed by itself (back, a link): the box follows
watch(() => props.filters.text, (value) => { text.value = value })
watch(text, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => value !== props.filters.text && emit('change', { ...props.filters, text: value }), 250)
})
onBeforeUnmount(() => clearTimeout(timer))

const toggle = (list, value) => (list.includes(value) ? list.filter((one) => one !== value) : [...list, value])
const clear = () => emit('change', { text: '', who: [], label: [], due: '' })
</script>

<template>
  <form class="filters" role="search" aria-label="Filter the cards" @submit.prevent>
    <input v-model="text" type="search" placeholder="Search the cards" aria-label="Search the cards" maxlength="100">
    <span class="group" role="group" aria-label="Given to">
      <button
        v-for="person in people"
        :key="person._id"
        type="button"
        class="chip"
        :class="{ on: filters.who.includes(person.username) }"
        :aria-pressed="filters.who.includes(person.username)"
        :title="person.name"
        @click="emit('change', { ...filters, who: toggle(filters.who, person.username) })"
      ><PersonBadge :person="person" /></button>
      <button type="button" class="chip" :class="{ on: filters.who.includes('nobody') }" :aria-pressed="filters.who.includes('nobody')" @click="emit('change', { ...filters, who: toggle(filters.who, 'nobody') })">Nobody</button>
    </span>
    <span v-if="labels.length" class="group" role="group" aria-label="Labels">
      <button v-for="label in labels" :key="label" type="button" class="chip" :class="{ on: filters.label.includes(label) }" :aria-pressed="filters.label.includes(label)" @click="emit('change', { ...filters, label: toggle(filters.label, label) })">{{ label }}</button>
    </span>
    <label class="due-filter">Due
      <select :value="filters.due" @change="emit('change', { ...filters, due: $event.target.value })">
        <option value="">Any time</option>
        <option value="overdue">Overdue</option>
        <option value="soon">In the next 7 days</option>
        <option value="none">No date</option>
      </select>
    </label>
    <button v-if="!isEmpty(filters)" type="button" class="link" @click="clear">Clear</button>
  </form>
</template>
