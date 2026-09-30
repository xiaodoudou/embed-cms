<template>
  <div class="plugin-wrapper">
    <div class="plugin-title">
      <h5>Import from remote node-cms</h5>
    </div>
    <v-card elevation="0" class="import-from-remote">
      <div class="main-container">
        <!-- TODO: hugo -
          diplay both local and remote URL
            do we add a form to manually enter the remote node-cms's info ?
          should be able to select the resources in common that we want to sync
            for the selected resources, allow to select the records we want to sync
          add a dialog when clicking import btn to confirm the import
        -->
        <div class="local">
          local
        </div>
        <div class="remote">
          remote
        </div>
        <div class="actions">
          <v-btn>Import</v-btn>
        </div>
      </div>
    </v-card>
  </div>
</template>

<script>
// import RequestService from '@s/RequestService'
// import _ from 'lodash'
  export default {
    data () {
      return {

      }
    },
    async mounted () {
      console.warn('MOUNTED')
    },
    methods: {

    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
.import-from-remote {
  margin: var(--cms-space-4) var(--cms-space-6) var(--cms-space-6);
  padding: var(--cms-space-6);
  max-width: var(--cms-content-max);
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: $layout-card-background;
  .main-container {
    display: flex;
    align-items: stretch;
    flex-wrap: wrap;
    gap: var(--cms-space-4);
    .local,
    .remote {
      flex: 1 1 280px;
      min-height: 96px;
      padding: var(--cms-space-4);
      border: 1px dashed var(--cms-border-strong);
      border-radius: var(--cms-radius-md);
      color: var(--cms-text-muted);
      text-transform: capitalize;
    }
    .actions {
      width: 100%;
    }
  }
}

@media (max-width: 599.98px) {
  .import-from-remote {
    margin: var(--cms-space-3);
    padding: var(--cms-space-4);
  }
}
</style>
