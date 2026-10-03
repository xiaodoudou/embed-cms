<template>
  <div class="activations">
    embed-cms - Plugin example
  </div>
</template>

<script>
  // import _ from 'lodash'
  import Dialog from '../mixins/Dialog.vue'

  export default {
    mixins: [Dialog],
    async mounted () {
    // window.DialogService.send(true)
    // await this.$nextTick()
    // window.DialogService.show({event: 'event-test', data: '', callback: ()=> this.test('test log')})
    },
    methods: {
      /** @param {*} data logged */
      test(data) {
        console.log('test ', data)
      }
    }
  }
</script>
