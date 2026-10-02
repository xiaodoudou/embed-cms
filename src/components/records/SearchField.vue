<template>
  <div class="search-field" :class="[`variant-${variant}`, {'has-value': hasValue}]">
    <v-icon class="search-icon" size="small" icon="$magnify" aria-hidden="true" />
    <input
      ref="input" class="search-input" type="text" :value="modelValue" :placeholder="placeholder" :aria-label="ariaLabel || placeholder"
      :name="name" autocomplete="off" spellcheck="false" @input="$emit('update:modelValue', $event.target.value)" @keydown.esc="onEscape"
    >
    <button
      v-if="hasValue" type="button" class="search-clear" :aria-label="$filters.translate('TL_CLEAR_FILTER')" :title="$filters.translate('TL_CLEAR_FILTER')"
      @click="clear"
    >
      <v-icon size="14" icon="$close" />
    </button>
  </div>
</template>

<script>
  import _ from 'lodash'

  /**
   * The one search/filter input of the admin: leading icon inside the field, clear button at the right
   * (only with a value), Escape clears (or blurs when already empty), focus returns to the input after clearing.
   * variant: 'default' (light/dark surface) or 'chrome' (dark navigation).
   */
  export default {
    props: {
      modelValue: { type: String, default: '' },
      placeholder: { type: String, default: '' },
      ariaLabel: { type: String, default: '' },
      name: { type: String, default: 'search' },
      variant: { type: String, default: 'default' }
    },
    emits: ['update:modelValue', 'clear'],
    computed: {
      hasValue () {
        return !_.isEmpty(this.modelValue)
      }
    },
    methods: {
      focus () {
        _.invoke(this.$refs, 'input.focus')
      },
      blur () {
        _.invoke(this.$refs, 'input.blur')
      },
      clear () {
        this.$emit('update:modelValue', '')
        this.$emit('clear')
        this.focus()
      },
      onEscape (event) {
        if (this.hasValue) {
          event.stopPropagation()
          this.clear()
        } else {
          this.blur()
        }
      }
    }
  }
</script>

<style lang="scss">
.search-field {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  height: 40px;
  border: 1px solid var(--cms-border-strong);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface);
  color: var(--cms-text);
  transition: border-color var(--cms-motion-fast) var(--cms-ease), box-shadow var(--cms-motion-fast) var(--cms-ease);

  &:hover {
    border-color: var(--cms-text-muted);
  }

  &:focus-within {
    border-color: var(--cms-primary);
    box-shadow: 0 0 0 1px var(--cms-primary);
  }

  .search-icon {
    position: absolute;
    left: var(--cms-space-3);
    color: var(--cms-text-muted);
    pointer-events: none;
  }

  .search-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0 var(--cms-space-3) 0 calc(var(--cms-space-3) + 16px + var(--cms-space-2));
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--cms-fs-base);
    &::placeholder {
      color: var(--cms-text-muted);
      opacity: 1;
    }
    // room for the clear button so text never runs under it
    &:not(:placeholder-shown) {
      padding-right: 36px;
    }
    &::-webkit-search-cancel-button {
      display: none;
    }
  }

  .search-clear {
    position: absolute;
    right: var(--cms-space-2);
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: var(--cms-radius-pill);
    background: var(--cms-surface-3);
    color: var(--cms-text);
    cursor: pointer;
    &:hover {
      background: var(--cms-border-strong);
      color: var(--cms-surface);
    }
    &:focus-visible {
      outline: 2px solid var(--cms-focus-ring);
      outline-offset: 1px;
    }
    // 44px effective touch target without enlarging the visual
    &::after {
      content: '';
      position: absolute;
      inset: -12px;
    }
  }

  &.variant-chrome {
    height: 36px;
    border-color: var(--cms-chrome-border);
    background: var(--cms-chrome-hover);
    color: var(--cms-chrome-text);
    &:hover {
      border-color: var(--cms-chrome-muted);
    }
    &:focus-within {
      border-color: var(--cms-chrome-accent);
      box-shadow: 0 0 0 1px var(--cms-chrome-accent);
    }
    .search-icon,
    .search-input::placeholder {
      color: var(--cms-chrome-muted);
    }
    .search-clear {
      background: var(--cms-chrome-border);
      color: var(--cms-chrome-text);
      &:hover {
        background: var(--cms-chrome-muted);
        color: var(--cms-chrome-bg);
      }
    }
  }
}

// list search in query mode (sift:...) shows validity on the field itself
.search.is-query.is-valid .search-field {
  border-color: var(--cms-success);
  background: var(--cms-success-soft);
}

.search.is-query.is-invalid .search-field {
  border-color: var(--cms-error);
  background: var(--cms-error-soft);
}
</style>
