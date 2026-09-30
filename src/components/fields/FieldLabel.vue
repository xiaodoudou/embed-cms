<template>
  <div class="field-label">
    <span v-if="schema.required" class="required-mark" aria-hidden="true">* </span>{{ schema.label }}<span v-if="schema.required" class="cms-visually-hidden"> ({{ $filters.translate('TL_REQUIRED') }})</span>
  </div>
</template>

<script>
  import _ from 'lodash'

  export default {
    props: {
      schema: { type: Object, default: () => {} },
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
  .v-icon {
    margin-top: -8px;
  }
}
</style>
