<template>
  <div class="choice-field" :class="[`is-${variant}`, { 'is-readonly': isReadonly, 'is-disabled': isDisabled, 'is-inline': variant === 'radio' && options.inline }]">
    <field-label :schema="schema" :disabled="disabled" />
    <div
      ref="input" class="choice-items" role="radiogroup" :aria-label="schema.label" :aria-required="schema.required ? 'true' : undefined"
      :aria-readonly="isReadonly ? 'true' : undefined" :aria-disabled="isDisabled ? 'true' : undefined"
    >
      <label
        v-for="item in options.items" :key="String(item.value)" class="choice-item" :class="{ 'is-selected': item.value === current }"
        :title="variant === 'segmented' ? item.description : undefined"
      >
        <input
          type="radio" class="choice-input" :name="groupName" :value="String(item.value)" :checked="item.value === current" :disabled="isDisabled"
          :aria-describedby="item.description && variant === 'radio' ? descriptionId(item) : undefined" :aria-readonly="isReadonly ? 'true' : undefined"
          @change="choose(item.value)" @click="onClick($event, item.value)" @keydown="onKey($event)" @focus="onFieldFocus(true)" @blur="onFieldFocus(false)"
        >
        <span v-if="variant === 'radio'" class="choice-mark" aria-hidden="true" />
        <span class="choice-body">
          <span class="choice-label">{{ item.label }}</span>
          <span v-if="item.description && variant === 'radio'" :id="descriptionId(item)" class="choice-description">{{ item.description }}</span>
        </span>
      </label>
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
  import { choiceOptions } from '@u/choice'

  let counter = 0

  /**
   * One value chosen from a short list that is all in view: `input: 'radio'` draws a column of radio buttons (each can have a description under it), `input: 'segmented'` a row of
   * joined buttons. Both are a group of native radio buttons, so that the arrow keys, the tab order and what a screen reader says are the ones of the browser. The value is the
   * value of the choice, as it is written in `source`; nothing when none is chosen.
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // the radio buttons of a group share a name; each field has its own
        groupName: `choice-${++counter}`
      }
    },
    computed: {
      /** @returns {string} 'radio' or 'segmented' */
      variant () {
        return this.schema.input === 'radio' ? 'radio' : 'segmented'
      },
      /** @returns {{items: Array<Object>, clearable: boolean, inline: boolean}} what the field says */
      options () {
        return choiceOptions(this.schema)
      },
      /** @returns {string|number|undefined} the value of the record, when it is one of the choices */
      current () {
        const value = this._value
        return _.some(this.options.items, { value }) ? value : undefined
      },
      /** @returns {boolean} */
      isReadonly () {
        return !!this.schema.readonly
      },
      /** @returns {boolean} the prop or the schema */
      isDisabled () {
        return !!(this.disabled || this.schema.disabled)
      }
    },
    methods: {
      /**
       * @param {Object} item a choice
       * @returns {string} the id of its description, which the radio button points at
       */
      descriptionId (item) {
        return `${this.groupName}-${_.indexOf(this.options.items, item)}-description`
      },
      /** @param {string|number} value the choice that was made */
      choose (value) {
        if (this.isLocked() || this.isReadonly) {
          this.restore()
          return
        }
        this.write(value)
      },
      /**
       * A click on the choice that is chosen already takes it away, when the field may be empty. (The browser does not say anything of a click on a radio button that is checked.)
       * @param {MouseEvent} event
       * @param {string|number} value
       */
      onClick (event, value) {
        if (this.isReadonly || this.isLocked()) {
          // (a radio button that is read-only is still checked by a click: put them back as the value says)
          event.preventDefault()
          this.restore()
          return
        }
        if (value === this.current && this.options.clearable) {
          event.target.checked = false
          this.write(undefined)
        }
      },
      /**
       * Delete and Backspace take the choice away, when the field may be empty.
       * @param {KeyboardEvent} event
       */
      onKey (event) {
        if ((event.key === 'Delete' || event.key === 'Backspace') && this.options.clearable && !this.isLocked() && !this.isReadonly && !_.isUndefined(this.current)) {
          event.preventDefault()
          this.write(undefined)
          this.$el.querySelectorAll('.choice-input').forEach((input) => { input.checked = false })
        }
      },
      /** Puts the radio buttons back as the value says (a change that was refused). */
      restore () {
        this.$nextTick(() => {
          this.$el.querySelectorAll('.choice-input').forEach((input, index) => { input.checked = this.options.items[index].value === this.current })
        })
      },
      /** @param {string|number|undefined} value written to the record */
      write (value) {
        this._value = value
        this.$emit('input', value, this.schema.model)
      }
    }
  }
</script>

<style lang="scss">
.choice-field {
  .choice-items {
    display: flex;
    flex-wrap: wrap;
  }
  .choice-item {
    position: relative;
    display: inline-flex;
    cursor: pointer;
    // the buttons that are really there are the radio buttons, which are not drawn: their label is
    .choice-input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
      pointer-events: none;
    }
  }

  // ---- segmented: joined buttons, the chosen one filled
  &.is-segmented {
    .choice-items {
      display: inline-flex;
      flex-wrap: nowrap;
      max-width: 100%;
      overflow-x: auto;
      border: 1px solid var(--cms-border-strong);
      border-radius: var(--cms-radius-md);
    }
    .choice-item {
      flex: 0 0 auto;
      min-height: var(--cms-field-h);
      & + .choice-item {
        border-left: 1px solid var(--cms-border-strong);
      }
      &:first-child .choice-body {
        border-radius: calc(var(--cms-radius-md) - 1px) 0 0 calc(var(--cms-radius-md) - 1px);
      }
      &:last-child .choice-body {
        border-radius: 0 calc(var(--cms-radius-md) - 1px) calc(var(--cms-radius-md) - 1px) 0;
      }
    }
    .choice-body {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 var(--cms-space-4);
      color: var(--cms-text);
      font-weight: 500;
      white-space: nowrap;
      transition: background var(--cms-motion-fast) var(--cms-ease), color var(--cms-motion-fast) var(--cms-ease);
    }
    .choice-item:hover .choice-body {
      background: var(--cms-surface-2);
    }
    .choice-item.is-selected .choice-body {
      background: rgb(var(--v-theme-primary));
      color: rgb(var(--v-theme-on-primary));
    }
    .choice-input:focus-visible + .choice-body {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: -3px;
    }
  }

  // ---- radio: a column of circles with their labels, and a description under a label
  &.is-radio {
    .choice-items {
      flex-direction: column;
      gap: var(--cms-space-2);
    }
    &.is-inline .choice-items {
      flex-direction: row;
      gap: var(--cms-space-2) var(--cms-space-6);
    }
    .choice-item {
      align-items: flex-start;
      gap: var(--cms-space-3);
      min-height: 28px;
    }
    .choice-mark {
      position: relative;
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      margin-top: 2px;
      border: 2px solid var(--cms-border-strong);
      border-radius: 50%;
      background: var(--cms-surface);
      transition: border-color var(--cms-motion-fast) var(--cms-ease);
      &::after {
        content: '';
        position: absolute;
        inset: 3px;
        border-radius: 50%;
        background: rgb(var(--v-theme-primary));
        transform: scale(0);
        transition: transform var(--cms-motion-fast) var(--cms-ease);
      }
    }
    .choice-item.is-selected .choice-mark {
      border-color: rgb(var(--v-theme-primary));
      &::after {
        transform: scale(1);
      }
    }
    .choice-input:focus-visible ~ .choice-mark {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
    }
    .choice-body {
      display: flex;
      flex-direction: column;
    }
    .choice-label {
      color: var(--cms-text);
      line-height: 24px;
    }
    .choice-description {
      color: var(--cms-text-muted);
      font-size: var(--cms-fs-sm);
    }
  }

  // ---- read-only and disabled
  &.is-readonly .choice-item {
    cursor: default;
  }
  &.is-disabled {
    .choice-item {
      cursor: not-allowed;
      opacity: 0.55;
    }
    &.is-segmented .choice-items {
      border-style: dashed;
    }
  }
}
</style>
