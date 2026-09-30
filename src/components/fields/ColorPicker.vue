<template>
  <div class="wrapper-color">
    <field-label :schema="schema" />
    <v-color-picker
      v-if="options.model" ref="input" :key="schema.model + 'custom'" :model-value="color" variant="outlined" @update:model-value="onPick"
      elevation="1" :dot-size="options.dotSize" :hide-canvas="options.hideCanvas" :hide-sliders="options.hideSliders"
      :hide-inputs="options.hideInputs" :model="options.outputModel" :disabled="isLocked()" :class="{disabled: isLocked()}"
    />
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
    props: {
      locale: { type: String, default: 'enUS' }
    },
    data () {
      return {
        acceptedModes: ['hexa', 'rgba', 'hsla', 'hex', 'rgb'],
        color: '',
        options: { outputModel: 'hexa', hideInputs: false, hideCanvas: false, hideSliders: false }
      }
    },
    watch: {
      'schema.model': function () {
        this.color = this.getColor()
      }
    },
    created () {
      const options = _.extend(this.options, this.schema)
      if (_.indexOf(this.acceptedModes, options.outputModel) === -1) {
        console.warn(`Invalid color mode detected: '${options.outputModel}', will default to hexa`)
        options.outputModel = 'hexa'
      }
      this.options = options
    },
    mounted () {
      this.color = this.getColor()
    },
    methods: {
      // Only a change made in the picker is written to the record. Showing the default colour (or the picker echoing
      // the value it was given) must not, or a new record would look edited before anyone touched it.
      onPick (value) {
        if (this.isLocked() || _.toLower(value) === _.toLower(this.color)) {
          return
        }
        this.color = value
        this.onChangeData(value)
      },
      getColor () {
        return _.get(this.model, `${this.schema.model}`, '#000000FF')
      }
    }
  }
</script>
