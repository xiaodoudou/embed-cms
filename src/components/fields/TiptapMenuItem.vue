<template>
  <v-btn class="menu-item" icon elevation="0" variant="text" :class="{ 'is-active': isActive ? isActive(): null }" :title="title" :aria-label="title" :aria-pressed="isActive ? (isActive() ? 'true' : 'false') : undefined" @click.stop.prevent="action">
    <v-icon>{{ icon }}</v-icon>
  </v-btn>
</template>

<script>

  export default {
    props: {
      icon: {
        type: String,
        required: true
      },
      title: {
        type: String,
        required: true
      },
      action: {
        type: Function,
        required: true
      },
      isActive: {
        type: Function,
        default: null
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;

.menu-item {
  background: transparent;
  border: none;
  color: $wysiwyg-toolbar-color;
  border-radius: var(--cms-radius-sm) !important;
  width: 32px;
  height: 32px;
  cursor: pointer;

  .v-icon {
    color: $wysiwyg-toolbar-color;
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
  &:hover {
    background-color: $wysiwyg-toolbar-hover-background;
  }
  &.is-active {
    background-color: var(--cms-primary-soft);
    .v-icon {
      color: var(--cms-on-primary-soft);
    }
  }
}

@media (pointer: coarse) {
  .menu-item {
    width: 40px;
    height: 40px;
  }
}
</style>
