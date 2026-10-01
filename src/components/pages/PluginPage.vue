<template>
  <div class="plugin-page">
    <component :is="plugin.component" :component="plugin.component" />
  </div>
</template>

<script>

  export default {
    props: {
      plugin: { type: Object, default: () => ({}) }
    }
  }
</script>
<style lang="scss" scoped>
.plugin-page {
  background-color: var(--cms-bg);
  overflow: auto;
}
</style>

<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.plugin-page {
  .plugin-title {
    background-color: transparent;
    padding: var(--cms-space-6) var(--cms-space-6) var(--cms-space-2);
    h5 {
      @include h1;
      margin: 0;
      color: $plugin-title-color;
    }
  }
}

@media (max-width: 599.98px) {
  .plugin-page .plugin-title {
    padding: var(--cms-space-4) var(--cms-space-4) var(--cms-space-1);
    h5 {
      font-size: var(--cms-fs-xl);
    }
  }
  .plugin-page .cms-import {
    margin: var(--cms-space-3);
    padding: var(--cms-space-4);
  }
}
</style>
