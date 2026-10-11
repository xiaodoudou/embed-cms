<template>
  <div class="token-field" :class="{ 'is-locked': isLocked() }">
    <v-text-field
      :id="inputId" ref="input"
      :theme="theme" :class="[schema.labelClasses]" :model-value="_value" :readonly="isLocked()"
      :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :disabled="disabled"
      persistent-placeholder hide-details="auto" autocomplete="off" spellcheck="false" validate-on="blur" :rules="[validateField]"
      :aria-label="schema.label" :aria-required="schema.required ? 'true' : undefined" :aria-readonly="isLocked() ? 'true' : undefined"
      @update:model-value="onChangeData" @update:focused="onFieldFocus"
    >
      <template #prepend><field-label :schema="schema" :disabled="disabled" :input-id="inputId" /></template>
      <template #append-inner>
        <v-btn
          v-if="_value" class="token-copy" icon variant="text" size="small" :disabled="disabled"
          :aria-label="$filters.translate('TL_TOKEN_COPY')" :title="$filters.translate('TL_TOKEN_COPY')" @click="copy"
        >
          <v-icon icon="$contentCopy" />
        </v-btn>
        <v-btn
          v-if="!isLocked()" class="token-generate" icon variant="text" size="small"
          :aria-label="$filters.translate('TL_TOKEN_GENERATE')" :title="$filters.translate('TL_TOKEN_GENERATE')" @click="generate"
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
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import NotificationsService from '@s/NotificationsService'
  import TranslateService from '@s/TranslateService'
  import { generateToken, tokenOptions } from '@u/token'

  /**
   * A token: a key or an id that two systems share. It is typed, pasted, or made here with the Generate button, and copied
   * with the Copy button. With `autoGenerate`, a new record gets one at once, and the server makes one too when a record is
   * created without it (lib/util/token.js).
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    mounted () {
      // a new record only: an existing one keeps what it has, even nothing, so that opening it changes nothing
      if (!this._value && !this.isLocked() && !_.get(this.model, '_id') && tokenOptions(this.schema).autoGenerate) {
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
      generate () {
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
