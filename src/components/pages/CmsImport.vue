<template>
  <div class="plugin-wrapper">
    <div class="plugin-title">
      <h5>Cms Import</h5>
    </div>
    <v-card elevation="0" class="cms-import">
      <div class="main-container">
        <div class="config-resources">
          <h5>Resources</h5>
          <v-chip-group v-if="config && config.resources" column>
            <v-chip
              v-for="(item, index) in config.resources" :key="`resource-${index}`"
              size="small" :ripple="false"
            >
              {{ item }}
            </v-chip>
          </v-chip-group>
        </div>
        <div class="divider dashed" />
        <h5>Actions</h5>
        <div>
          <v-btn rounded density="compact" @click="openFile()">Edit Google Sheet</v-btn>
          <div class="other-actions">
            <v-btn rounded density="compact" :disabled="loading" @click="checkStatus()">Check Difference</v-btn>
            <v-btn rounded density="compact" :disabled="loading" @click="execute()">Import from Remote</v-btn>
          </div>
        </div>
        <div class="divider dashed" />
        <h5>Upload Xlsx</h5>
        <div class="subtext">Import Excel</div>
        <v-card
          class="file-input-card" elevation="0" :class="{ 'drag-and-drop': dragover, bold: uploadedXlsx && uploadedXlsx.name }"
          @drop.prevent="onDrop($event)" @dragover.prevent="dragover = true" @dragenter.prevent="dragover = true" @dragleave.prevent="dragover = false"
        >
          <template v-if="!uploadedXlsx">Click or drag & drop to import an .xlsx file</template>
          <template v-else>{{ uploadedXlsx.name }}</template>
          <v-file-input
            ref="xlsxFile" accept=".xlsx, .xls, .csv"
            :rules="getRules()" class="hidden-field" flat density="compact" hide-details @change="onChangeXlsxFile"
          />
        </v-card>
        <div class="other-actions margin-top">
          <v-btn rounded density="compact" :disabled="loading || !uploadedXlsx" @click="checkXlsxStatus()">Check Difference</v-btn>
          <v-btn rounded density="compact" :disabled="loading || !uploadedXlsx" @click="executeXlsx()">Import file</v-btn>
        </div>
        <div v-if="status || error">
          <h6 v-if="type == 0">Difference:</h6>
          <h6 v-else>Status:</h6>
          <div v-if="status" class="status">
            <div v-for="(item, resource) in status" :key="`status-item-${resource}`" class="status-resource">
              <strong>{{ resource }}:</strong>
              <p>create: {{ item.create || 0 }}</p>
              <p>update: {{ item.update || 0 }}</p>
              <p>remove: {{ item.remove || 0 }}</p>
            </div>
          </div>
          <pre v-else-if="error" v-html="sanitizeHtml(error)" />
        </div>
      </div>
    </v-card>
  </div>
</template>

<script>
  import RequestService from '@s/RequestService'
  import NotificationsService from '@s/NotificationsService'
  import TranslateService from '@s/TranslateService'
  import { importCounts } from '@u/recordLabel'
  import _ from 'lodash'
  import { sanitizeHtml } from '@u/sanitizeHtml'
  export default {
    data () {
      return {
        config: null,
        status: null,
        error: null,
        type: 0,
        loading: false,
        uploadedXlsx: null,
        dragover: false
      }
    },
    async mounted () {
      const data = await RequestService.get('./config')
      this.config = data.import
    },
    methods: {
      sanitizeHtml,
      /** @returns {Array<Function>} the Vuetify rule: xlsx, xls or csv */
      getRules () {
        return [
          (value) => !value || value.type === 'text/xlsx' || value.type === 'text/xls' || value.type === 'text/csv' || 'Only XLSX/XLS/CSV files allowed'
        ]
      },
      /** @param {DragEvent} event a single file; more are refused */
      onDrop (event) {
        this.dragover = false
        const files = _.get(event, 'dataTransfer.files', [])
        if (files.length > 1) {
          console.error('Only one file can be uploaded at a time.')
          return
        }
        this.onChangeXlsxFile(event, files)
      },
      /**
       * @param {Event|File} event the change event, or the file itself
       * @param {File[]|false} files from a drop
       */
      async onChangeXlsxFile (event, files = false) {
        this.uploadedXlsx = null
        // the change event holds the files, a drop hands them over, and some Vuetify versions hand over the file itself
        const file = _.first(files || _.get(event, 'target.files', event)) || (event instanceof Blob ? event : null)
        if (!file) {
          return
        }
        this.uploadedXlsx = file
      },
      /** Opens the Google sheet of the config in a new tab. */
      openFile () {
        // a blocked pop-up gives no window
        window.open(`https://docs.google.com/spreadsheets/d/${this.config.gsheetId}/edit`, '_blank')?.focus()
      },
      /** Asks the server what the remote import would change. */
      async checkStatus () {
        this.loading = true
        this.status = null
        this.error = null
        this.$loading.start('cms-import')
        this.type = 0
        await this.$nextTick()
        NotificationsService.send(TranslateService.get('TL_IMPORT_STARTED', { name: 'Difference check' }), 'info')
        try {
          this.status = await RequestService.get('../import/status')
          NotificationsService.send(TranslateService.get('TL_IMPORT_DONE', { name: 'Difference check', counts: importCounts(this.status) }), 'success')
        } catch (error) {
          this.status = null
          this.error = _.get(error, 'message', error)
          NotificationsService.send(TranslateService.get('TL_IMPORT_FAILED', { name: 'Import', error: _.toString(this.error) }), 'error')
        }
        this.$loading.stop('cms-import')
        this.loading = false
      },
      /** Runs the remote import. */
      async execute () {
        this.loading = true
        this.status = null
        this.error = null
        this.type = 1
        this.$loading.start('cms-import')
        await this.$nextTick()
        NotificationsService.send(TranslateService.get('TL_IMPORT_STARTED', { name: 'Import from remote' }), 'info')
        try {
          this.status = await RequestService.get('../import/execute')
          NotificationsService.send(TranslateService.get('TL_IMPORT_DONE', { name: 'Import from remote', counts: importCounts(this.status) }), 'success')
        } catch (error) {
          this.status = null
          this.error = _.get(error, 'message', error)
          NotificationsService.send(TranslateService.get('TL_IMPORT_FAILED', { name: 'Import', error: _.toString(this.error) }), 'error')
        }
        this.$loading.stop('cms-import')
        this.loading = false
      },
      /** Asks the server what the uploaded spreadsheet would change. */
      async checkXlsxStatus () {
        this.loading = true
        this.status = null
        this.error = null
        this.$loading.start('xlsx-import')
        this.type = 0
        await this.$nextTick()
        NotificationsService.send(TranslateService.get('TL_IMPORT_STARTED', { name: 'Difference check (Excel)' }), 'info')
        try {
          const formData = new FormData()
          formData.append('xlsx', this.uploadedXlsx)
          this.status = await RequestService.post('../import/statusXlsx', formData)
          NotificationsService.send(TranslateService.get('TL_IMPORT_DONE', { name: 'Difference check (Excel)', counts: importCounts(this.status) }), 'success')
        } catch (error) {
          this.status = null
          this.error = _.get(error, 'message', error)
          NotificationsService.send(TranslateService.get('TL_IMPORT_FAILED', { name: 'Import', error: _.toString(this.error) }), 'error')
        }
        this.$loading.stop('xlsx-import')
        this.loading = false
      },
      /** Imports the uploaded spreadsheet. */
      async executeXlsx () {
        this.loading = true
        this.status = null
        this.error = null
        this.type = 1
        this.$loading.start('xlsx-import')
        await this.$nextTick()
        NotificationsService.send(TranslateService.get('TL_IMPORT_STARTED', { name: 'Excel import' }), 'info')
        try {
          const formData = new FormData()
          formData.append('xlsx', this.uploadedXlsx)
          this.status = await RequestService.post('../import/executeXlsx', formData)
          NotificationsService.send(TranslateService.get('TL_IMPORT_DONE', { name: 'Excel import', counts: importCounts(this.status) }), 'success')
        } catch (error) {
          this.status = null
          this.error = _.get(error, 'message', error)
          NotificationsService.send(TranslateService.get('TL_IMPORT_FAILED', { name: 'Import', error: _.toString(this.error) }), 'error')
        }
        this.$loading.stop('xlsx-import')
        this.loading = false
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.cms-import {
  margin: var(--cms-space-4) var(--cms-space-6) var(--cms-space-6);
  padding: var(--cms-space-6);
  max-width: var(--cms-content-max);
  background-color: $layout-card-background;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  h5 {
    @include h3;
    margin-bottom: var(--cms-space-2);
  }
  h6 {
    @include h6;
    font-weight: var(--cms-fw-semibold);
    margin-top: var(--cms-space-4);
  }
  .divider {
    border-bottom: 1px solid var(--cms-border);
    margin: var(--cms-space-6) 0;
    &.dashed {
      border-bottom: 1px dashed var(--cms-border-strong);
    }
  }
  .other-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-2);
    &.margin-top {
      margin-top: var(--cms-space-4);
    }
  }
  .v-btn {
    background-color: $cms-import-btn-background !important;
    color: $cms-import-btn-color !important;
    &.v-btn--disabled {
      background-color: var(--cms-surface-3) !important;
      color: var(--cms-text-muted) !important;
    }
  }
  .subtext {
    @include subtext;
    color: var(--cms-text-muted);
    margin-bottom: var(--cms-space-2);
  }
  .file-input-card {
    position: relative;
    cursor: pointer;
    background-color: var(--cms-surface-2);
    border: 2px dashed var(--cms-border-strong);
    border-radius: var(--cms-radius-md);
    color: var(--cms-text);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--cms-space-8) var(--cms-space-4);
    user-select: none;
    &:focus-within {
      outline: 2px solid var(--cms-focus-ring);
      outline-offset: 2px;
    }
    &.bold {
      font-weight: var(--cms-fw-semibold);
    }
    &.drag-and-drop {
      background-color: var(--cms-primary-soft);
      border-color: var(--cms-primary);
      color: var(--cms-on-primary-soft);
    }
  }
  .hidden-field {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    user-select: none;
  }
  .v-slide-group__content {
    padding: 0 !important;
  }
  .v-chip {
    @include subtext;
    background-color: $cms-import-resource-background !important;
    color: $cms-import-resource-color !important;
    padding: var(--cms-space-1) var(--cms-space-2);
    .v-chip__content {
      padding: 0;
      line-height: 1;
    }
  }
}
</style>

<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

.cms-import {
  .v-btn__content {
    text-transform: none;
    letter-spacing: 0;
    @include cta-text;
  }
  .status {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-3);
    margin-top: var(--cms-space-2);
  }
  .status-resource {
    min-width: 160px;
    padding: var(--cms-space-3);
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-md);
    background: var(--cms-surface-2);
    strong {
      font-size: var(--cms-fs-base);
    }
    p {
      margin: 0;
      font-size: var(--cms-fs-sm);
      color: var(--cms-text-muted);
    }
  }
  pre {
    margin-top: var(--cms-space-2);
    padding: var(--cms-space-3);
    overflow: auto;
    border-radius: var(--cms-radius-md);
    background: var(--cms-code-bg);
    color: var(--cms-error);
    font-family: var(--cms-font-mono);
    font-size: var(--cms-fs-sm);
  }
}
</style>
