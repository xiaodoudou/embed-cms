<script>
  export default {
    async mounted () {
      window.DialogService.events.on('dialog', this.onGetRecordEdition)
      window.DialogService.events.on('dialog:show', this.onGetRecordEditionShowDialog)
      window.DialogService.events.on('dialog:confirm', this.onGetRecordEditionConfirm)
    },
    unmounted() {
      window.DialogService.events.off('dialog', this.onGetRecordEdition)
      window.DialogService.events.off('dialog:show', this.onGetRecordEditionShowDialog)
      window.DialogService.events.off('dialog:confirm', this.onGetRecordEditionConfirm)
    },
    methods: {
      /** @param {*} data logged */
      onGetRecordEdition(data) {
        console.warn(`onGetRecordEdition`, data)
      },
      /** @param {*} data logged */
      onGetRecordEditionShowDialog(data) {
        console.warn(`onGetRecordEditionShowDialog`, data)
      },
      /** @param {*} data logged */
      onGetRecordEditionConfirm(data) {
        console.warn(`onGetRecordEditionConfirm`, data)
      }
    }
  }
</script>
