<template>
  <v-menu v-model="opened" location="bottom end" :close-on-content-click="false" content-class="cms-column-menu">
    <template #activator="{ props }">
      <v-btn
        v-bind="props" class="table-tool" variant="outlined" size="small" :aria-label="$filters.translate('TL_COLUMNS')" :aria-expanded="opened ? 'true' : 'false'"
        aria-haspopup="dialog"
      >
        <v-icon size="small" icon="$viewColumn" />
        <span class="tool-label">{{ $filters.translate('TL_COLUMNS') }}</span>
        <span class="tool-count" aria-hidden="true">{{ visibleCount }}/{{ ordered.length }}</span>
      </v-btn>
    </template>
    <v-card class="column-menu-card" role="dialog" :aria-label="$filters.translate('TL_COLUMNS')">
      <div class="column-menu-head">
        <span class="column-menu-title">{{ $filters.translate('TL_COLUMNS_SHOWN', { shown: visibleCount, total: ordered.length }) }}</span>
        <v-btn variant="text" size="small" :disabled="!customised" @click="$emit('reset')">{{ $filters.translate('TL_COLUMNS_RESET') }}</v-btn>
      </div>
      <ul class="column-menu-list">
        <li v-for="(column, index) in ordered" :key="column.key" class="column-row">
          <label class="column-label">
            <input
              type="checkbox" class="cms-check" :checked="!isHidden(column)" :disabled="!isHidden(column) && visibleCount <= 1"
              @change="$emit('toggle', column.key)"
            >
            <span class="column-name">{{ column.label }}</span>
            <span v-if="column.locale" class="column-badge">{{ localeLabel(column.locale) }}</span>
          </label>
          <span class="column-move">
            <button
              type="button" class="cms-icon-btn" :disabled="index === 0" :aria-label="`${$filters.translate('TL_MOVE_COLUMN_UP')}: ${column.label}`"
              :title="$filters.translate('TL_MOVE_COLUMN_UP')" @click="$emit('move', column.key, -1)"
            >
              <v-icon size="16" icon="$chevronUp" />
            </button>
            <button
              type="button" class="cms-icon-btn" :disabled="index === ordered.length - 1" :aria-label="`${$filters.translate('TL_MOVE_COLUMN_DOWN')}: ${column.label}`"
              :title="$filters.translate('TL_MOVE_COLUMN_DOWN')" @click="$emit('move', column.key, 1)"
            >
              <v-icon size="16" icon="$chevronDown" />
            </button>
          </span>
        </li>
      </ul>
    </v-card>
  </v-menu>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'
  import { orderedColumns, isColumnHidden } from '@u/tableModel'

  /** Column menu of the table: show or hide, reorder with the arrow buttons, reset. Preferences live in RecordTable. */
  export default {
    props: {
      columns: { type: Array, default: () => [] },
      prefs: { type: Object, default: () => ({}) }
    },
    emits: ['toggle', 'move', 'reset'],
    data () {
      return { opened: false }
    },
    computed: {
      ordered () {
        return orderedColumns(this.columns, this.prefs)
      },
      visibleCount () {
        return _.size(_.reject(this.ordered, (column) => this.isHidden(column)))
      },
      customised () {
        return _.has(this.prefs, 'hidden') || _.has(this.prefs, 'order')
      }
    },
    methods: {
      isHidden (column) {
        return isColumnHidden(this.columns, this.prefs, column.key)
      },
      localeLabel (locale) {
        return TranslateService.get(`TL_${_.toUpper(locale)}`)
      }
    }
  }
</script>
