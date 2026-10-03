<template>
  <div class="custom-checkbox" :class="{disabled: isDisabled, readonly: isReadonly}">
    <field-label :schema="schema" :disabled="disabled" />
    <div
      ref="input" class="switch" role="switch" :aria-checked="getValue() ? 'true' : 'false'" :aria-label="schema.label"
      :aria-readonly="isReadonly ? 'true' : undefined" :aria-disabled="isDisabled ? 'true' : undefined" :class="{active: getValue()}"
      :tabindex="isDisabled ? -1 : 0" @click="onChange" @keydown.space.prevent="onChange" @keydown.enter.prevent="onChange"
      @focus="onFieldFocus(true)" @blur="onFieldFocus(false)"
    >
      <div class="drag" />
      <div class="labels">
        <span class="label inactive">{{ $filters.translate('TL_NO') }}</span>
        <span class="label active">{{ $filters.translate('TL_YES') }}</span>
      </div>
    </div>
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'

  export default {
    mixins: [AbstractField],
    emits: ['input'],
    computed: {
      isReadonly () {
        return !!this.schema.readonly
      },
      isDisabled () {
        return !!(this.disabled || this.schema.disabled)
      }
    },
    methods: {
      getValue () {
        const value = _.get(this.model, this.schema.model, false)
        return _.isNull(value) ? false : value
      },
      onChange () {
        if (this.isDisabled || this.isReadonly) {
          return
        }
        this._value = !this.getValue()
        this.$emit('input', this._value, this.schema.model)
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
  .custom-checkbox {
    .switch {
      position: relative;
      width: 80px;
      height: 32px;
      left: 4px;
      border-radius: 100px;
      border: 2px solid $switch-field-border-color;
      background-color: $switch-field-background;
      color: $switch-field-color;
      cursor: pointer;
      .drag {
        width: 24px;
        height: 24px;
        border-radius: 100px;
        background-color: $switch-field-drag-background;
        position: absolute;
        top: 2px;
        left: auto;
        right: 2px;
        transition: transform 0.3s;
      }
      .labels {
        padding: 0px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 28px;
        user-select: none;
      }
      .label {
        @include subtext;
        opacity: 1;
        font-weight: 700;
        transition: opacity 0.3s;
        &.active {
          opacity: 0;
        }
      }
      &.active {
        background-color: $switch-field-active-background;
        color: $switch-field-active-color;
        right: auto;
        .drag {
          background-color: $switch-field-active-drag-background;
          transform: translateX(-200%);
        }
        .label {
          &.active {
            opacity: 1;
          }
          &.inactive {
            opacity: 0;
          }
        }
      }
    }
      // read-only: tinted, no border, lock icon; disabled: page colour, dashed, muted
      &.readonly .switch {
        border-color: transparent;
        background-color: var(--cms-field-readonly-bg);
        cursor: default;
        color: var(--cms-text);
        .drag {
          background-color: var(--cms-text-muted);
        }
      }
      &.disabled .switch {
        border: 2px dashed var(--cms-border-strong);
        background-color: var(--cms-field-disabled-bg);
        color: var(--cms-text-muted);
        cursor: not-allowed;
        .drag {
          background-color: var(--cms-border-strong);
        }
      }
  }
</style>
