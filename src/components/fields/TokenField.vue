<template>
  <div class="token-field" :class="{ 'is-locked': isLocked() }">
    <v-text-field
      :id="inputId" ref="input"
      :theme="theme" :class="[schema.labelClasses]" :model-value="_value" readonly
      :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :disabled="disabled"
      persistent-placeholder hide-details="auto" autocomplete="off" spellcheck="false" :rules="[validateField]"
      :aria-label="schema.label" :aria-required="schema.required ? 'true' : undefined" aria-readonly="true" @update:focused="onFieldFocus"
    >
      <template #prepend><field-label :schema="schema" :disabled="disabled" :input-id="inputId" /></template>
      <template #append-inner>
        <v-btn
          class="token-copy" icon variant="text" size="small" :disabled="!_value || disabled"
          :aria-label="$filters.translate('TL_TOKEN_COPY')" :title="$filters.translate('TL_TOKEN_COPY')" @click="copy"
        >
          <v-icon icon="$contentCopy" />
        </v-btn>
        <v-btn
          v-if="!isLocked()" class="token-regenerate" icon variant="text" size="small"
          :aria-label="$filters.translate('TL_TOKEN_REGENERATE')" :title="$filters.translate('TL_TOKEN_REGENERATE')" @click="regenerate"
        >
          <v-icon icon="$refresh" />
        </v-btn>
      </template>
    </v-text-field>
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import AbstractField from '@m/AbstractField'
  import NotificationsService from '@s/NotificationsService'
  import TranslateService from '@s/TranslateService'
  import { generateToken } from '@u/token'

  /**
   * A token: a random value made once, for a key or an id that other systems use. A new record gets one at once; it is
   * read-only, copied with a button, and replaced with another (the record still has to be saved, so Discard brings the
   * old one back). The server makes one too when a record is created without it (lib/util/token.js).
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    mounted () {
      if (!this._value && !this.isLocked()) {
        this._value = generateToken(this.schema)
      }
    },
    methods: {
      /** Copies the token, and says so. */
      async copy () {
        try {
          await navigator.clipboard.writeText(this._value)
          NotificationsService.send(TranslateService.get('TL_TOKEN_COPIED'), 'success')
        } catch (error) {
          console.error('The token could not be copied:', error)
        }
      },
      /** Puts a new token in the field; the record keeps the old one until it is saved. */
      regenerate () {
        this._value = generateToken(this.schema)
      }
    }
  }
</script>

<style lang="scss" scoped>
.token-field {
  :deep(input) {
    font-family: var(--cms-font-mono);
    font-size: var(--cms-fs-sm);
  }
}
</style>
