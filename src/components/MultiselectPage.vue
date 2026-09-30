<template>
  <v-card elevation="0" class="multiselect-page">
    <div class="top-bar">
      <h2 class="multiselect-title">{{ $filters.translate('TL_NUMBER_OF_SELECTED_RECORDS', { num: size(multiselectItems) }) }}</h2>
      <div class="buttons">
        <v-btn elevation="0" class="delete" :disabled="isEmpty(multiselectItems)" @click="onClickDelete">{{ $filters.translate('TL_DELETE') }}</v-btn>
      </div>
    </div>
    <div class="scroll-wrapper" :class="{'scrolled-to-bottom': scrolledToBottom}" @scroll="onScroll">
      <div class="selected-records-list">
        <div v-for="item in multiselectItems" :key="item._id" class="selected-record">
          <v-chip variant="outlined" :ripple="false">
            <v-btn
              class="deselect-item" icon variant="text" size="x-small" density="comfortable" :ripple="false"
              :aria-label="$filters.translate('TL_DESELECT_ITEM', { name: getName(item) })" @click="deselectItem(item)"
            >
              <v-icon size="small" icon="$closeCircleOutline" />
            </v-btn>
            {{ $filters.translate(getName(item)) }} ({{ item._id }})
          </v-chip>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script>
  import pAll from 'p-all'
  import _ from 'lodash'
  import RecordNameHelper from '@c/RecordNameHelper'
  import AbstractEditorView from '@c/AbstractEditorView'
  import TranslateService from '@s/TranslateService'
  import Notification from '@m/Notification'
  import RequestService from '@s/RequestService'
  import { getRecordLabel } from '@u/recordLabel'

  export default {
    mixins: [RecordNameHelper, AbstractEditorView, Notification],
    props: {
      resource: { type: Object, default: () => {} },
      locale: { type: String, default: 'enUS' },
      multiselectItems: { type: Array, default: () => [] },
      recordList: { type: Array, default: () => [] }
    },
    data () {
      return {
        scrolledToBottom: false,
        size: _.size,
        isEmpty: _.isEmpty
      }
    },
    methods: {
      onScroll ({ target: { scrollTop, clientHeight, scrollHeight } }) {
        this.scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 50
      },
      deselectItem (item) {
        this.$emit('changeMultiselectItems', _.filter(this.multiselectItems, i => i._id !== item._id))
      },
      onClickCancel () { this.$emit('cancel') },
      async onClickDelete () {
        const names = _.map(_.take(this.multiselectItems, 3), (item) => getRecordLabel(this.resource, item, this.locale) || item._id)
        const more = _.size(this.multiselectItems) > 3 ? ` +${_.size(this.multiselectItems) - 3}` : ''
        const single = _.size(this.multiselectItems) === 1
        window.DialogService.show({
          event: 'deleteRecords',
          destructive: true,
          title: single ? TranslateService.get('TL_DELETE_RECORD_TITLE', { name: names[0] }) : TranslateService.get('TL_DELETE_RECORDS_TITLE', { num: _.size(this.multiselectItems) }),
          message: single ? `${TranslateService.get('TL_ARE_YOU_SURE_TO_DELETE')} ${TranslateService.get('TL_ARE_YOU_SURE_TO_DELETE_IRREVERSIBLE')}` : `${_.join(names, ', ')}${more}. ${TranslateService.get('TL_ARE_YOU_SURE_TO_DELETE_IRREVERSIBLE')}`,
          confirm: TranslateService.get('TL_DELETE'),
          cancel: TranslateService.get('TL_CANCEL'),
          callback: () => this.doDelete()
        })
      },
      async doDelete () {
        this.$loading.start('onDeleteMultiselectedItems')
        let deleted = 0
        try {
          await pAll(_.map(this.multiselectItems, item => async () => {
            try {
              await RequestService.delete(`../api/${this.resource.title}/${item._id}`)
              deleted++
            } catch (error) {
              // Always log errors per instructions
              console.error('Failed to delete record:', error)
              this.manageError(error, 'delete', item)
            }
          }), { concurrency: 1 })
        } catch (error) {
          // Always log errors per instructions
          console.error('Failed to delete multiselected items:', error)
        }
        if (deleted === 1) {
          this.notify(TranslateService.get('TL_RECORD_DELETED_GENERIC'))
        } else if (deleted > 1) {
          this.notify(TranslateService.get('TL_RECORDS_DELETED_COUNT', { num: deleted }))
        }
        this.multiselect = false
        this.$loading.stop('onDeleteMultiselectedItems')
        this.$emit('updateRecordList', null)
        this.$emit('cancel')
      }
    }
  }
</script>
<style scoped lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.multiselect-title {
  margin: 0;
  @include h3;
}
.selected-records-list {
  display: flex;
  width: 100%;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cms-space-2);
  padding: var(--cms-space-4);
  .selected-record {
    flex: 1 1 280px;
    min-width: 0;
  }
  .v-chip {
    @include subtext;
    max-width: 100%;
    width: 100%;
    height: 36px;
    justify-content: flex-start;
    .deselect-item {
      margin-inline-start: calc(var(--cms-space-2) * -1);
      margin-inline-end: var(--cms-space-1);
    }
  }
}
.buttons {
  .delete {
    color: $multiselect-delete-button-color !important;
    background-color: $multiselect-delete-button-background !important;
    @include cta-text;
  }
}
</style>
