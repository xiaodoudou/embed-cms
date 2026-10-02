<template>
  <div class="field-label">
    <span v-if="schema.required" class="required-mark" aria-hidden="true">* </span>{{ schema.label }}<span v-if="schema.required" class="cms-visually-hidden"> ({{ $filters.translate('TL_REQUIRED') }})</span>
    <v-icon v-if="state === 'disabled'" class="cms-field-lock" size="14" icon="$lockOutline" :title="$filters.translate('TL_DISABLED')" />
    <v-icon v-else-if="state === 'readonly'" class="cms-field-readonly" size="14" icon="$eyeOutline" :title="$filters.translate('TL_READ_ONLY')" />
  </div>
</template>

<script>
  import _ from 'lodash'

  export default {
    props: {
      schema: { type: Object, default: () => {} },
      // the field is disabled by its parent (a locked group), whatever its own schema says
      disabled: { type: Boolean, default: false },
    },
    computed: {
      // disabled: greyed out, lock icon. Read-only: shown and copyable, eye icon
      state () {
        if (this.disabled || this.schema.disabled) {
          return 'disabled'
        }
        return this.schema.readonly ? 'readonly' : ''
      }
    },
    methods: {
      getHint () {
        return _.get(this.schema, 'hint', '')
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

.field-label {
  font-size: var(--cms-fs-sm);
  line-height: var(--cms-lh-base);
  font-weight: var(--cms-fw-semibold);
  color: $field-label-color;
  .required-mark {
    color: var(--cms-error);
    font-weight: var(--cms-fw-bold);
  }
  .cms-field-lock,
  .cms-field-readonly {
    margin-left: var(--cms-space-1);
    vertical-align: -2px;
  }
}
</style>
