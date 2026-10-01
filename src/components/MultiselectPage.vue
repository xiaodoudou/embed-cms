<template>
  <v-card elevation="0" class="multiselect-page">
    <div class="top-bar">
      <h2 class="multiselect-title">{{ $filters.translate('TL_NUMBER_OF_SELECTED_RECORDS', { num: size(multiselectItems) }) }}</h2>
      <div class="buttons">
        <v-btn elevation="0" class="delete" :disabled="isEmpty(multiselectItems)" @click="onClickDelete">{{ $filters.translate('TL_DELETE') }}</v-btn>
      </div>
    </div>
    <div ref="scroller" class="scroll-wrapper" :class="{'scrolled-to-bottom': scrolledToBottom, scrollable}" @scroll="onScroll">
      <div class="selected-records-list">
        <div v-for="item in multiselectItems" :key="item._id" class="selected-record">
          <!-- the same chip as the tags of the fields: soft indigo, with its own close button -->
          <v-chip
            closable :ripple="false" :title="item._id" :close-label="$filters.translate('TL_DESELECT_ITEM', { name: getName(item) })"
            @click:close="deselectItem(item)"
          >
            <span class="chip-name">{{ $filters.translate(getName(item)) }}</span>
            <span class="chip-id">{{ item._id }}</span>
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
        scrollable: false,
        size: _.size,
        isEmpty: _.isEmpty
      }
    },
    watch: {
      multiselectItems () {
        this.$nextTick(this.measure)
      }
    },
    mounted () {
      this.measure()
      window.addEventListener('resize', this.measure)
    },
    beforeUnmount () {
      window.removeEventListener('resize', this.measure)
    },
    methods: {
      onScroll ({ target: { scrollTop, clientHeight, scrollHeight } }) {
        this.scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 50
      },
      // the fade that hints at more records below only shows when there are more records below
      measure () {
        const el = this.$refs.scroller
        if (!el) {
          return
        }
        this.scrollable = el.scrollHeight > el.clientHeight + 1
        this.scrolledToBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
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
.selected-records-list:after {
  opacity: 0;
}
.scroll-wrapper.scrollable:not(.scrolled-to-bottom) .selected-records-list:after {
  opacity: 1;
}
.selected-records-list {
  display: flex;
  width: 100%;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cms-space-2);
  padding: var(--cms-space-4);
  .selected-record {
    min-width: 0;
    max-width: 100%;
  }
  .v-chip {
    max-width: 100%;
  }
  .chip-name {
    font-weight: var(--cms-fw-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  // the id is there to tell records with the same name apart, so it stays quiet
  .chip-id {
    margin-left: var(--cms-space-2);
    font-family: var(--cms-font-mono);
    font-size: var(--cms-fs-xs);
    opacity: 0.75;
    white-space: nowrap;
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
