<template>
  <section v-if="items.length > 0" class="upload-panel" :aria-label="$filters.translate('TL_UPLOADS')">
    <header class="upload-head">
      <h2 class="upload-title">{{ $filters.translate('TL_UPLOADS') }}</h2>
      <span class="upload-summary" role="status" aria-live="polite">{{ summary }}</span>
      <v-btn v-if="hasFinished" variant="text" size="small" @click="clearFinished">{{ $filters.translate('TL_CLEAR') }}</v-btn>
    </header>
    <ul class="upload-list">
      <li v-for="item in items" :key="item.id" class="upload-item" :class="`is-${item.status}`">
        <div class="upload-row">
          <span class="upload-name" :title="item.name">{{ item.name }}</span>
          <span v-if="item.size" class="upload-size">{{ formatSize(item.size) }}</span>
        </div>
        <v-progress-linear
          class="upload-bar" :model-value="item.progress" :indeterminate="item.status === 'uploading' && item.indeterminate"
          :color="barColor(item)" height="6" rounded :aria-label="item.name"
        />
        <div class="upload-row">
          <span class="upload-state" :class="`state-${item.status}`">
            <template v-if="item.status === 'uploading'">{{ item.indeterminate ? $filters.translate('TL_UPLOADING') : item.progress + '%' }}</template>
            <template v-else-if="item.status === 'done'">{{ $filters.translate('TL_UPLOAD_DONE') }}</template>
            <template v-else-if="item.status === 'cancelled'">{{ $filters.translate('TL_UPLOAD_CANCELLED') }}</template>
            <template v-else>{{ $filters.translate('TL_UPLOAD_FAILED') }}: {{ item.error }}</template>
          </span>
          <span class="upload-actions">
            <v-btn v-if="item.status === 'error' || item.status === 'cancelled'" size="small" variant="text" @click="retry(item.id)">{{ $filters.translate('TL_RETRY') }}</v-btn>
            <v-btn
              v-if="item.status === 'uploading'" size="small" variant="text" :aria-label="$filters.translate('TL_CANCEL') + ' ' + item.name" @click="cancel(item.id)"
            >
              {{ $filters.translate('TL_CANCEL') }}
            </v-btn>
            <v-btn
              v-else icon size="small" variant="text" :aria-label="$filters.translate('TL_REMOVE') + ' ' + item.name" @click="dismiss(item.id)"
            >
              <v-icon size="small" icon="$close" />
            </v-btn>
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>

<script>
  import _ from 'lodash'
  import UploadService from '@s/UploadService'
  import TranslateService from '@s/TranslateService'

  export default {
    data () {
      return {
        items: UploadService.snapshot()
      }
    },
    computed: {
      hasFinished () {
        return _.some(this.items, (item) => item.status !== 'uploading')
      },
      summary () {
        const uploading = _.filter(this.items, { status: 'uploading' }).length
        const failed = _.filter(this.items, (item) => item.status === 'error').length
        if (uploading > 0) {
          return TranslateService.get('TL_UPLOADS_IN_PROGRESS', { num: uploading })
        }
        return failed > 0 ? TranslateService.get('TL_UPLOADS_FAILED', { num: failed }) : TranslateService.get('TL_UPLOADS_COMPLETE')
      }
    },
    mounted () {
      UploadService.events.on('change', this.onChange)
    },
    beforeUnmount () {
      UploadService.events.off('change', this.onChange)
    },
    methods: {
      onChange (items) {
        this.items = items
      },
      barColor (item) {
        return item.status === 'error' ? 'error' : item.status === 'done' ? 'success' : 'primary'
      },
      formatSize (bytes) {
        if (bytes < 1024) {
          return `${bytes} B`
        }
        return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
      },
      retry (id) {
        UploadService.retry(id)
      },
      cancel (id) {
        UploadService.cancel(id)
      },
      dismiss (id) {
        UploadService.dismiss(id)
      },
      clearFinished () {
        UploadService.clearFinished()
      }
    }
  }
</script>

<style lang="scss">
.upload-panel {
  position: fixed;
  right: var(--cms-space-4);
  bottom: var(--cms-space-4);
  z-index: var(--cms-z-toast);
  width: min(360px, calc(100vw - 32px));
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  background: var(--cms-surface);
  color: var(--cms-text);
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  box-shadow: var(--cms-shadow-3);
  overflow: hidden;

  .upload-head {
    display: flex;
    align-items: center;
    gap: var(--cms-space-2);
    padding: var(--cms-space-2) var(--cms-space-3) var(--cms-space-2) var(--cms-space-4);
    border-bottom: 1px solid var(--cms-border);
    background: var(--cms-surface-2);
  }

  .upload-title {
    margin: 0;
    font-size: var(--cms-fs-base);
    font-weight: var(--cms-fw-semibold);
  }

  .upload-summary {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
  }

  .upload-list {
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }

  .upload-item {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-1);
    padding: var(--cms-space-3) var(--cms-space-4);
    border-bottom: 1px solid var(--cms-border);
    &:last-child {
      border-bottom: 0;
    }
  }

  .upload-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cms-space-2);
    min-width: 0;
  }

  .upload-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--cms-fw-medium);
  }

  .upload-size,
  .upload-state {
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
  }

  .upload-state.state-error {
    color: var(--cms-error);
    font-weight: var(--cms-fw-medium);
  }

  .upload-state.state-done {
    color: var(--cms-success);
  }

  .upload-actions {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
  }
}
</style>
