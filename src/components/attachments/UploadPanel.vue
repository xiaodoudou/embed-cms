<template>
  <section
    v-if="items.length > 0" class="upload-panel" :aria-label="$filters.translate('TL_UPLOADS')"
    @mouseenter="pause" @mouseleave="resume" @focusin="pause" @focusout="resume"
  >
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
    <span v-if="countdown" class="upload-countdown" :class="{paused: countdown.paused}" :style="{animationDuration: countdown.ms + 'ms'}" aria-hidden="true" />
  </section>
</template>

<script>
  import _ from 'lodash'
  import UploadService from '@s/UploadService'
  import TranslateService from '@s/TranslateService'

  // When every upload is done the panel clears itself after this long, with a bar that shows the time left
  // (hovering or focusing the panel pauses it). Failed or cancelled uploads stay, they need a decision.
  const AUTO_CLEAR_MS = 6000

  export default {
    data () {
      return {
        items: UploadService.snapshot(),
        countdown: null,
        timer: null,
        startedAt: 0,
        remaining: 0
      }
    },
    computed: {
      /** @returns {boolean} */
      allDone () {
        return this.items.length > 0 && _.every(this.items, (item) => item.status === 'done')
      },
      /** @returns {boolean} whether any item is no longer uploading */
      hasFinished () {
        return _.some(this.items, (item) => item.status !== 'uploading')
      },
      /** @returns {string} the header line: uploads in progress, else failures, else complete */
      summary () {
        const uploading = _.filter(this.items, { status: 'uploading' }).length
        const failed = _.filter(this.items, (item) => item.status === 'error').length
        if (uploading > 0) {
          return TranslateService.get('TL_UPLOADS_IN_PROGRESS', { num: uploading })
        }
        return failed > 0 ? TranslateService.get('TL_UPLOADS_FAILED', { num: failed }) : TranslateService.get('TL_UPLOADS_COMPLETE')
      }
    },
    watch: {
      allDone (done) {
        return done ? this.startCountdown() : this.stopCountdown()
      }
    },
    updated () {
      this.publishHeight()
    },
    mounted () {
      UploadService.events.on('change', this.onChange)
      this.publishHeight()
      if (this.allDone) {
        this.startCountdown()
      }
    },
    beforeUnmount () {
      UploadService.events.off('change', this.onChange)
      document.documentElement.style.setProperty('--cms-upload-panel-h', '0px')
      this.stopCountdown()
    },
    methods: {
      // The toasts sit in the same corner: tell them how much room the panel takes (plus a gap), 0 when it is not shown
      publishHeight () {
        const panel = this.$el && this.$el.nodeType === 1 ? this.$el : null
        const height = panel ? Math.ceil(panel.getBoundingClientRect().height) + 8 : 0
        document.documentElement.style.setProperty('--cms-upload-panel-h', `${height}px`)
      },
      /** Starts the auto-clear countdown over. */
      startCountdown () {
        this.stopCountdown()
        this.countdown = { ms: AUTO_CLEAR_MS, paused: false }
        this.remaining = AUTO_CLEAR_MS
        this.schedule()
      },
      /** Arms the timer for what remains of the countdown. */
      schedule () {
        this.startedAt = Date.now()
        this.timer = setTimeout(() => UploadService.clearFinished(), this.remaining)
      },
      stopCountdown () {
        clearTimeout(this.timer)
        this.timer = null
        this.countdown = null
      },
      /** Hover: keeps what remains of the countdown. */
      pause () {
        if (!this.countdown || this.countdown.paused) {
          return
        }
        clearTimeout(this.timer)
        this.remaining = Math.max(1000, this.remaining - (Date.now() - this.startedAt))
        this.countdown.paused = true
      },
      resume () {
        if (!this.countdown || !this.countdown.paused) {
          return
        }
        this.countdown.paused = false
        this.schedule()
      },
      /** @param {Array<Object>} items the queue of UploadService */
      onChange (items) {
        this.items = items
      },
      /**
       * @param {{status: string}} item
       * @returns {string} a Vuetify colour: error, success or primary
       */
      barColor (item) {
        return item.status === 'error' ? 'error' : item.status === 'done' ? 'success' : 'primary'
      },
      /**
       * @param {number} bytes
       * @returns {string} B, KB or MB with one decimal
       */
      formatSize (bytes) {
        if (bytes < 1024) {
          return `${bytes} B`
        }
        return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
      },
      /** @param {string} id an upload */
      retry (id) {
        UploadService.retry(id)
      },
      /** @param {string} id an upload */
      cancel (id) {
        UploadService.cancel(id)
      },
      /** @param {string} id an upload */
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
@keyframes upload-countdown {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

.upload-panel {
  position: fixed;
  right: var(--cms-space-4);
  bottom: var(--cms-space-4);
  z-index: var(--cms-z-toast);
  width: var(--cms-toast-width);
  // never taller than this: the list inside scrolls
  max-height: min(50vh, 420px);
  display: flex;
  flex-direction: column;
  background: var(--cms-surface);
  color: var(--cms-text);
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  box-shadow: var(--cms-shadow-3);
  overflow: hidden;

  // time left before the finished uploads clear themselves
  .upload-countdown {
    flex: 0 0 auto;
    height: 3px;
    width: 100%;
    background: var(--cms-success);
    opacity: 0.5;
    transform-origin: left center;
    animation: upload-countdown linear forwards;
    &.paused {
      animation-play-state: paused;
    }
    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }

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
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
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
