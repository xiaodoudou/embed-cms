<template>
  <div :class="['group', `nested-level-${paragraphLevel}`, { collapsible, 'is-collapsed': isCollapsed }]" @cms-reveal-group="open = true">
    <div class="header">
      <!-- a title that opens and closes the group: the whole bar is the button -->
      <button v-if="collapsible" type="button" class="group-toggle" :aria-expanded="isCollapsed ? 'false' : 'true'" :aria-controls="contentId" @click="open = !open">
        <v-icon class="group-chevron" size="small" icon="$chevronRight" />
        <span class="group-title">{{ schema.label }}</span>
      </button>
      <field-label v-else :schema="schema" :disabled="disabled" />
    </div>
    <!-- v-show, not v-if: a closed group keeps its fields, so that they are validated and saved like the others -->
    <div v-show="!isCollapsed" :id="contentId" class="group-content">
      <custom-form
        ref="input"
        v-model:model="model"
        :schema="schema.groupOptions"
        :paragraph-level="paragraphLevel + 1"
        @error="onError"
        @input="onModelUpdated"
      />
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'

  /**
   * Fields that belong together (the keys that share a first part, `address.city`), under a title. The resource says more in `groups` (see SchemaService.getNestedGroups): a
   * `collapsible` group opens and closes from its title, a `collapsed` one starts closed, a `layout` puts its fields side by side. A closed group opens when a field in it is
   * invalid or is jumped to (see utils/groups.js).
   */
  export default {
    mixins: [AbstractField],
    props: {
      groupOptions: { type: Object, default: () => ({}) },
      paragraphLevel: { type: Number, default: 0 }
    },
    emits: ['input'],
    data () {
      return {
        errors: null,
        // closed when the resource says so; the group starts that way every time the record is opened
        open: !_.get(this.schema, 'collapsed', false)
      }
    },
    computed: {
      /** @returns {boolean} the title opens and closes it */
      collapsible () {
        return !!_.get(this.schema, 'collapsible', false)
      },
      /** @returns {boolean} its fields are out of sight */
      isCollapsed () {
        return this.collapsible && !this.open
      },
      /** @returns {string} the id of the fields, for the button that shows them */
      contentId () {
        return `${this.inputId}-content`
      }
    },
    methods: {
      /** @param {Error} error logged */
      onError (error) {
        console.error('Group - onError:', error)
      },
      /** @throws {Error} when the inner form has errors, kept in this.errors */
      async validate () {
        const isValid = _.get(await this.$refs.input.validate(), 'length', 0) === 0
        if (!isValid) {
          this.errors = this.$refs.input.errors
          this.open = true
          throw new Error('group validation error')
        }
        return isValid
      },
      /** @returns {*} what the inner form answers */
      debouncedValidate () {
        return this.$refs.input.debouncedValidate()
      },
      /** @returns {*} what the inner form answers */
      clearValidationErrors () {
        return this.$refs.input.clearValidationErrors()
      },
      /**
       * @param {*} value
       * @param {string} model the field path; both emitted as input
       */
      onModelUpdated (value, model) {
        this.$emit('input', value, model)
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.header {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  justify-content: flex-start;
  gap: 16px;
  background-color: $paragraph-top-bar-background;
  color: $paragraph-top-bar-color !important;
  display: flex;
  justify-content: space-between;
  height: 34px;
  // the same inset as the fields below it, and the top corners follow the rounded border of the group
  padding: 0 16px;
  border-radius: 6px 6px 0 0;
  box-sizing: border-box;
}
// the title of a group that opens: the whole bar is the button, as the title of a block is
.group-toggle {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--cms-fs-sm);
  font-weight: var(--cms-fw-semibold);
  line-height: var(--cms-lh-base);
  text-align: left;
  cursor: pointer;
  &:focus-visible {
    outline: 2px solid var(--cms-primary);
    outline-offset: 2px;
  }
  .group-chevron {
    flex: 0 0 auto;
    transition: transform var(--cms-motion-fast) var(--cms-ease);
  }
  &[aria-expanded='true'] .group-chevron {
    transform: rotate(90deg);
  }
}
.group {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  align-items: stretch;
  border: 2px $paragraph-top-bar-background solid;
  border-radius: 8px;
  .group-content {
    padding: 8px 16px;
  }
  // closed: the bar is the whole group, its bottom corners round too
  &.is-collapsed .header {
    border-radius: 6px;
  }
  // a finger needs a bar as tall as a button
  @media (pointer: coarse) {
    &.collapsible .header {
      height: var(--cms-touch-target);
    }
  }
  @for $i from 1 through 6 {
    $valIndex: get-level-index($i);
    &.nested-level-#{$i} {
      @include nested-paragraph-levels-border($valIndex);
      .header, .field-label {
        @include nested-paragraph-levels($valIndex);
      }
    }
  }
}
</style>
