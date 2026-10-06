<template>
  <div class="rating-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" />
    <div class="rating-row">
      <div ref="input" class="rating-items" role="radiogroup" :aria-label="schema.label" :aria-required="schema.required ? 'true' : undefined" :aria-readonly="isReadonly ? 'true' : undefined" :aria-disabled="isDisabled ? 'true' : undefined" @mouseleave="hovered = 0">
        <span v-for="(item, index) in items" :key="index" class="rating-item" :class="[`is-${item.fill === 1 ? 'full' : item.fill === 0.5 ? 'half' : 'empty'}`, { 'has-half': options.half }]" :style="{ '--rating-color': `var(--cms-${options.color})` }">
          <v-icon class="rating-empty" :icon="icons.empty" :size="size" />
          <v-icon class="rating-full" :icon="icons.full" :size="size" :style="{ clipPath: `inset(0 ${100 - item.fill * 100}% 0 0)` }" />
          <button
            v-for="step in item.steps" :key="step.value" type="button" class="rating-step" :class="{ 'is-left': step.half }" role="radio"
            :aria-checked="step.value === current ? 'true' : 'false'" :aria-label="stepLabel(step.value)" :tabindex="step.focusable ? 0 : -1" :disabled="isLocked()"
            @click="choose(step.value)" @mouseenter="hovered = step.value" @focus="onFieldFocus(true)" @blur="onFieldFocus(false)" @keydown="onKey($event, step.value)"
          />
        </span>
      </div>
      <span class="rating-text" aria-hidden="true">{{ text }}</span>
      <v-btn v-if="options.clearable && current && !isLocked()" class="rating-clear" icon variant="text" size="x-small" :aria-label="$filters.translate('TL_RATING_CLEAR')" :title="$filters.translate('TL_RATING_CLEAR')" @click="clear"><v-icon icon="$closeCircleOutline" /></v-btn>
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
  import { ICONS, fillOf, normaliseRating, ratingOptions, ratingText, stepsOf } from '@u/rating'

  /**
   * A rating: icons filled up to the value, chosen with a click or the arrow keys. The value is a number from 1 (or 0.5 with half steps) to
   * `max`, and nothing when there is no rating. It is a group of radio buttons, one for each value, so that a screen reader says "3 of 5".
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // the value the pointer is over: a preview of the one a click would choose
        hovered: 0
      }
    },
    computed: {
      /** @returns {{max: number, half: boolean, icon: string, color: string, clearable: boolean}} what the field says */
      options () {
        return ratingOptions(this.schema)
      },
      /** @returns {{full: string, empty: string}} the icons the rating is made of */
      icons () {
        return ICONS[this.options.icon]
      },
      /** @returns {number} the size of an icon, in pixels */
      size () {
        // a finger: larger icons, so that the half of a heart is wider than a fingertip's slip (18px)
        return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 36 : 28
      },
      /** @returns {number} the rating of the record, 0 when there is none */
      current () {
        return normaliseRating(this._value, this.options.max, this.options.half) || 0
      },
      /** @returns {number} the rating that is drawn: the one under the pointer while it is over, else the value */
      shown () {
        return !this.isLocked() && this.hovered ? this.hovered : this.current
      },
      /** @returns {Array<{fill: number, steps: Array<{value: number, half: boolean, focusable: boolean}>}>} each icon, how full it is, and the buttons that choose it */
      items () {
        const steps = stepsOf(this.options.max, this.options.half)
        const tabbable = this.current || steps[0]
        return _.times(this.options.max, (index) => ({
          fill: fillOf(index, this.shown),
          steps: _.map(_.filter(steps, value => Math.ceil(value) === index + 1), value => ({ value, half: this.options.half && value % 1 !== 0, focusable: value === tabbable }))
        }))
      },
      /** @returns {string} "3.5 / 5" */
      text () {
        return ratingText(this.current, this.options.max)
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
       * @param {number} value
       * @returns {string} what a screen reader says of the radio button: the label of the field and "3 of 5"
       */
      stepLabel (value) {
        return `${this.schema.label}: ${this.$filters.translate('TL_RATING_OF', { value, max: this.options.max })}`
      },
      /**
       * Chooses a rating; the one that is chosen again is taken away (unless the field must keep one).
       * @param {number} value
       */
      choose (value) {
        if (this.isLocked()) {
          return
        }
        if (value === this.current) {
          return this.options.clearable ? this.clear() : undefined
        }
        this.write(value)
      },
      /** Takes the rating away: the field holds nothing, so a required one is missing again. */
      clear () {
        if (!this.isLocked()) {
          this.write(undefined)
        }
      },
      /** @param {number|undefined} value written to the record */
      write (value) {
        this._value = value
        this.$emit('input', value, this.schema.model)
      },
      /**
       * The arrows move by a step and choose it, Home and End go to the ends, Delete and Backspace take the rating away.
       * @param {KeyboardEvent} event
       * @param {number} value the radio button the key was pressed on
       */
      onKey (event, value) {
        const steps = stepsOf(this.options.max, this.options.half)
        const at = steps.indexOf(value)
        let next
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          next = steps[Math.min(at + 1, steps.length - 1)]
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          next = steps[Math.max(at - 1, 0)]
        } else if (event.key === 'Home') {
          next = steps[0]
        } else if (event.key === 'End') {
          next = _.last(steps)
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          return this.clear()
        } else {
          return
        }
        event.preventDefault()
        if (this.isLocked()) {
          return
        }
        this.write(next)
        this.$nextTick(() => {
          const button = this.$el.querySelector('.rating-step[aria-checked="true"]')
          if (button) {
            button.focus()
          }
        })
      }
    }
  }
</script>

<style lang="scss">
.rating-field {
  .rating-row {
    display: flex;
    align-items: center;
    gap: var(--cms-space-3);
    min-height: var(--cms-field-h);
  }
  .rating-items {
    display: inline-flex;
    gap: var(--cms-space-1);
  }
  // an icon is two glyphs one over the other: the empty one, and the full one cut to how full it is
  .rating-item {
    position: relative;
    display: inline-flex;
    width: 28px;
    height: 28px;
    .rating-empty {
      color: var(--cms-border-strong);
    }
    // with half steps the second button of an icon is over its right half
    &.has-half .rating-step:not(.is-left) {
      left: 50%;
    }
    .rating-full {
      position: absolute;
      inset: 0;
      color: var(--rating-color);
      transition: clip-path var(--cms-motion-fast) var(--cms-ease);
    }
  }
  // the buttons are over the icon, invisible: one over the whole icon, or one over each half
  .rating-step {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    padding: 0;
    border: 0;
    border-radius: var(--cms-radius-sm);
    background: transparent;
    cursor: pointer;
    &.is-left {
      right: 50%;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    &:focus-visible {
      outline: 2px solid var(--cms-focus-ring);
      outline-offset: 1px;
    }
    &:disabled {
      cursor: default;
    }
  }
  // a finger: icons of 36px a button's width apart (a half step is 22px wide), and ten of them wrap onto a second line on a narrow screen instead of leaving the tenth outside
  @media (pointer: coarse) {
    .rating-row {
      flex-wrap: wrap;
    }
    .rating-items {
      flex-wrap: wrap;
      gap: var(--cms-space-2);
    }
    .rating-item {
      width: 36px;
      height: 36px;
      .rating-step {
        left: calc(var(--cms-space-1) * -1);
        right: calc(var(--cms-space-1) * -1);
      }
      &.has-half .rating-step.is-left {
        right: 50%;
      }
      &.has-half .rating-step:not(.is-left) {
        left: 50%;
      }
    }
  }
  .rating-text {
    min-width: 3.5em;
    color: var(--cms-text-muted);
    font-size: var(--cms-fs-sm);
    font-variant-numeric: tabular-nums;
  }
  &.is-readonly .rating-empty {
    color: var(--cms-border);
  }
  &.is-disabled {
    .rating-full {
      color: var(--cms-text-muted);
    }
    .rating-empty {
      color: var(--cms-border);
    }
  }
}
</style>
