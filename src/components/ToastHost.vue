<template>
  <div class="toast-host" :aria-label="$filters.translate('TL_NOTIFICATIONS')">
    <transition-group name="toast" tag="div" class="toast-stack">
      <div
        v-for="toast in toasts" :key="toast.id" class="toast" :class="`toast-${toast.type}`" :role="isUrgent(toast) ? 'alert' : 'status'"
        @mouseenter="pause(toast)" @mouseleave="resume(toast)" @focusin="pause(toast)" @focusout="resume(toast)"
      >
        <v-icon class="toast-icon" size="20" :icon="iconFor(toast)" aria-hidden="true" />
        <div class="toast-body">
          <p class="toast-message">{{ toast.message }}</p>
          <div v-if="toast.detail || toast.actionLabel" class="toast-actions">
            <button v-if="toast.actionLabel" type="button" class="toast-link" @click="runAction(toast)">{{ toast.actionLabel }}</button>
            <button v-if="toast.detail" type="button" class="toast-link" :title="toast.detail" @click="copyDetail(toast)">{{ $filters.translate('TL_COPY_ID') }}</button>
          </div>
        </div>
        <v-btn class="toast-close" icon size="small" variant="text" :aria-label="$filters.translate('TL_DISMISS')" @click="dismiss(toast.id)">
          <v-icon size="small" icon="$close" />
        </v-btn>
        <span v-if="toast.timeout" class="toast-progress" :class="{paused: toast.paused}" :style="{animationDuration: toast.timeout + 'ms'}" aria-hidden="true" />
      </div>
    </transition-group>
  </div>
</template>

<script>
  import _ from 'lodash'
  import NotificationsService from '@s/NotificationsService'

  const MAX_VISIBLE = 3
  const AUTO_DISMISS_MS = 4000

  export default {
    data () {
      return {
        toasts: [],
        sequence: 0,
        timers: {}
      }
    },
    mounted () {
      NotificationsService.events.on('notification', this.onNotification)
      NotificationsService.events.on('clear-contextual', this.clearContextual)
    },
    beforeUnmount () {
      NotificationsService.events.off('notification', this.onNotification)
      NotificationsService.events.off('clear-contextual', this.clearContextual)
      _.each(this.timers, (timer) => clearTimeout(timer.handle))
    },
    methods: {
      isUrgent (toast) {
        return toast.type === 'error' || toast.type === 'warn'
      },
      iconFor (toast) {
        return { success: '$checkBold', error: '$alertBoxOutline', warn: '$alertOutline', info: '$informationOutline' }[toast.type] || '$informationOutline'
      },
      onNotification (data) {
        const type = _.includes(['success', 'error', 'warn', 'info'], data.type) ? data.type : 'info'
        // Errors and warnings stay until dismissed; success and info fade after a few seconds
        const timeout = type === 'success' || type === 'info' ? AUTO_DISMISS_MS : 0
        const toast = { id: ++this.sequence, message: data.message, type, detail: data.detail || '', actionLabel: data.actionLabel || '', action: data.action || null, timeout, paused: false }
        this.toasts = _.takeRight([...this.toasts, toast], MAX_VISIBLE)
        if (timeout) {
          this.schedule(toast, timeout)
        }
      },
      // errors and warnings do not fade, so they would outlive the page they are about
      clearContextual () {
        _.each(_.filter(this.toasts, (toast) => this.isUrgent(toast)), (toast) => this.dismiss(toast.id))
      },
      schedule (toast, ms) {
        clearTimeout(_.get(this.timers, [toast.id, 'handle']))
        this.timers[toast.id] = { handle: setTimeout(() => this.dismiss(toast.id), ms), started: Date.now(), remaining: ms }
      },
      pause (toast) {
        const timer = this.timers[toast.id]
        if (!timer || toast.paused) {
          return
        }
        clearTimeout(timer.handle)
        timer.remaining = Math.max(1000, timer.remaining - (Date.now() - timer.started))
        toast.paused = true
      },
      resume (toast) {
        if (!this.timers[toast.id] || !toast.paused) {
          return
        }
        toast.paused = false
        this.schedule(toast, this.timers[toast.id].remaining)
      },
      dismiss (id) {
        clearTimeout(_.get(this.timers, [id, 'handle']))
        delete this.timers[id]
        this.toasts = _.reject(this.toasts, { id })
      },
      runAction (toast) {
        if (_.isFunction(toast.action)) {
          toast.action()
        }
        this.dismiss(toast.id)
      },
      async copyDetail (toast) {
        try {
          await navigator.clipboard.writeText(toast.detail)
        } catch (error) {
          console.error('Failed to copy to clipboard:', error)
        }
      }
    }
  }
</script>

<style lang="scss">
.toast-host {
  position: fixed;
  left: 50%;
  top: max(var(--cms-space-4), env(safe-area-inset-top));
  z-index: var(--cms-z-toast);
  width: min(440px, calc(100vw - 32px));
  transform: translateX(-50%);
  pointer-events: none;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-2);
}

.toast {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--cms-space-3);
  padding: var(--cms-space-3) var(--cms-space-2) var(--cms-space-3) var(--cms-space-4);
  border: 1px solid var(--cms-border);
  border-left: 4px solid var(--cms-info);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface);
  color: var(--cms-text);
  box-shadow: var(--cms-shadow-3);
  font-size: var(--cms-fs-base);
  line-height: var(--cms-lh-base);
  overflow: hidden;
  pointer-events: auto;

  .toast-icon {
    flex: 0 0 auto;
    margin-top: 2px;
  }

  .toast-body {
    flex: 1 1 auto;
    min-width: 0;
  }

  .toast-message {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .toast-actions {
    display: flex;
    gap: var(--cms-space-3);
    margin-top: var(--cms-space-1);
  }

  .toast-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--cms-primary);
    font: inherit;
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-medium);
    text-decoration: underline;
    cursor: pointer;
    &:focus-visible {
      outline: 2px solid var(--cms-focus-ring);
      outline-offset: 2px;
    }
  }

  .toast-close {
    flex: 0 0 auto;
  }

  &.toast-success {
    border-left-color: var(--cms-success);
    .toast-icon {
      color: var(--cms-success);
    }
  }

  &.toast-error {
    border-left-color: var(--cms-error);
    background: var(--cms-error-soft);
    .toast-icon {
      color: var(--cms-error);
    }
  }

  &.toast-warn {
    border-left-color: var(--cms-warning);
    background: var(--cms-warning-soft);
    .toast-icon {
      color: var(--cms-warning);
    }
  }

  &.toast-info .toast-icon {
    color: var(--cms-info);
  }

  .toast-progress {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 100%;
    background: currentColor;
    color: var(--cms-success);
    opacity: 0.5;
    transform-origin: left center;
    animation: toast-progress linear forwards;
    &.paused {
      animation-play-state: paused;
    }
  }

  &.toast-info .toast-progress {
    color: var(--cms-info);
  }
}

@keyframes toast-progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: transform var(--cms-motion-base) var(--cms-ease), opacity var(--cms-motion-base) var(--cms-ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
  .toast .toast-progress {
    animation: none;
    transform: none;
  }
}

// keep the uploads panel clear of the toasts on phones
@media (max-width: 599.98px) {
  .upload-panel {
    bottom: 96px;
  }
}
</style>
