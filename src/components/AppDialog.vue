<template>
  <v-dialog
    :model-value="modelValue" class="cms-dialog" :class="`cms-dialog-${type}`" scrim="transparent" transition="dialog-transition"
    :role="type === 'destructive' ? 'alertdialog' : 'dialog'" :aria-labelledby="titleId" :aria-describedby="bodyId"
    @update:model-value="onUpdate" @after-enter="focusDefault" @after-leave="restoreFocus"
  >
    <div ref="card" class="cms-dialog-card">
      <div class="cms-dialog-head">
        <span class="cms-dialog-icon" :class="`is-${type}`" aria-hidden="true">
          <v-icon :icon="iconName" size="20" />
        </span>
        <h2 :id="titleId" class="cms-dialog-title">{{ title }}</h2>
      </div>
      <div :id="bodyId" class="cms-dialog-body">
        <slot>
          <p v-if="message">{{ message }}</p>
        </slot>
      </div>
      <div class="cms-dialog-foot">
        <v-btn ref="cancelButton" class="cms-dialog-cancel" variant="outlined" @click="$emit('cancel')">{{ cancelText }}</v-btn>
        <v-btn ref="confirmButton" class="cms-dialog-confirm" variant="flat" :color="type === 'destructive' ? 'error' : undefined" @click="$emit('confirm')">{{ confirmText }}</v-btn>
      </div>
    </div>
  </v-dialog>
</template>

<script>
  import _ from 'lodash'

  let dialogCounter = 0

  /**
   * The single dialog used across the admin (discard/leave, delete, logout, replicator...).
   * type: 'info' | 'warning' | 'destructive'. Destructive dialogs focus the safe (cancel)
   * button first, so pressing Enter right away never confirms a destructive action.
   */
  export default {
    props: {
      modelValue: { type: Boolean, default: false },
      title: { type: String, default: '' },
      message: { type: String, default: '' },
      type: { type: String, default: 'info' },
      icon: { type: String, default: '' },
      confirmText: { type: String, default: 'OK' },
      cancelText: { type: String, default: 'Cancel' }
    },
    emits: ['confirm', 'cancel', 'update:modelValue'],
    data () {
      dialogCounter++
      return {
        titleId: `cms-dialog-title-${dialogCounter}`,
        bodyId: `cms-dialog-body-${dialogCounter}`,
        trigger: null
      }
    },
    computed: {
      iconName () {
        if (this.icon) {
          return this.icon
        }
        return this.type === 'info' ? '$informationOutline' : this.type === 'warning' ? '$alertOutline' : '$trashCanOutline'
      }
    },
    watch: {
      modelValue (open) {
        if (open) {
          this.trigger = document.activeElement
        }
      }
    },
    methods: {
      onUpdate (value) {
        if (!value) {
          this.$emit('cancel')
        }
        this.$emit('update:modelValue', value)
      },
      focusDefault () {
        const target = this.type === 'destructive' ? this.$refs.cancelButton : this.$refs.confirmButton
        const elem = _.get(target, '$el', false)
        if (elem) {
          elem.focus()
        }
      },
      restoreFocus () {
        const trigger = this.trigger
        this.trigger = null
        if (trigger && document.body.contains(trigger) && _.isFunction(trigger.focus)) {
          trigger.focus()
        }
      }
    }
  }
</script>
