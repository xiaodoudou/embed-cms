<template>
  <div class="json-viewer-wrapper">
    <field-label :schema="schema" />
    <json-viewer v-if="schema" ref="input" :key="schema.model" :value="getData()" :copyable="true" tabindex="-1" @focus="onFieldFocus(true)" @blur="onFieldFocus(false)">
      <template #copy><v-btn icon size="small" elevation="0" variant="flat"><v-icon icon="$contentCopy" /></v-btn></template>
    </json-viewer>
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import {get as objGet} from 'lodash'
  import AbstractField from '@m/AbstractField'

  export default {
    mixins: [AbstractField],
    data () {
      return {
        options: {
          maxDepth: 0,
          modifiable: !this.disabled,
          rootObjectKey: this.schema.model
        }
      }
    },
    watch: {
      'schema.model': function () {
        this.options.rootObjectKey = this.schema.model
      }
    },
    methods: {
      getData () {
        return objGet(this.model, this.schema.model, false)
      }
    }
  }
</script>
<style lang="scss">
.json-viewer-wrapper {
  .jv-container.jv-light {
    border: 1px solid var(--cms-border-strong);
    border-radius: var(--cms-radius-md);
    background: var(--cms-field-bg);
    color: var(--cms-text);
    .jv-key,
    .jv-item.jv-undefined,
    .jv-item.jv-null {
      color: var(--cms-text-muted);
    }
    .jv-item.jv-string {
      color: var(--cms-success);
    }
    .jv-item.jv-number {
      color: var(--cms-info);
    }
    .jv-item.jv-boolean {
      color: var(--cms-warning);
    }
    .jv-ellipsis {
      background: var(--cms-surface-3);
      color: var(--cms-text-muted);
    }
    .jv-toggle::before {
      border-color: var(--cms-text-muted) transparent;
    }
  }

  .jv-container {
    .jv-button {
      padding: 0;
    }
    .jv-code {
      padding: 8px 0px;
      padding-left: 16px;
    }
  }
}
</style>
