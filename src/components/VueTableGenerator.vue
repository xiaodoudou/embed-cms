<template>
  <div
    class="cms-table" :class="[`density-${density}`, {'scrolled-x': scrolledX, 'scrollable-right': canScrollRight, narrow: isNarrow}]"
    :style="{'--cms-table-first-w': `${firstWidth}px`}"
  >
    <div ref="scroller" class="cms-table-scroll" @scroll.passive="onScroll">
      <table
        class="cms-table-grid" role="grid" :aria-label="label" aria-multiselectable="true" :aria-rowcount="rows.length + 1" :aria-colcount="columns.length + 2"
        :aria-busy="loading ? 'true' : 'false'" :style="{width: `${totalWidth}px`}" @keydown="onKeydown" @focusin="onFocusIn"
      >
        <colgroup>
          <col class="col-check">
          <col v-for="(column, index) in columns" :key="column.key" :style="{width: `${widths[index]}px`}">
          <col class="col-actions">
        </colgroup>
        <thead>
          <tr>
            <th scope="col" class="col-check sticky-left">
              <input
                type="checkbox" class="cms-check" :checked="selectionState === 'all'" :indeterminate="selectionState === 'some'"
                :aria-label="$filters.translate('TL_SELECT_ALL_ROWS')" :disabled="rows.length === 0" @change="$emit('update:selected', toggleAll())"
              >
            </th>
            <th
              v-for="(column, index) in columns" :key="column.key" scope="col" :aria-sort="ariaSort(column)"
              :class="{'sticky-left first': index === 0, 'align-right': column.align === 'right', sorted: !!sortEntry(column)}"
            >
              <button
                v-if="column.sortable" type="button" class="th-btn" :title="sortHint(column)"
                @click="$emit('sort', column.key, $event.shiftKey)"
              >
                <span class="th-label">{{ column.label }}</span>
                <span v-if="showLocaleBadge && column.locale" class="th-badge">{{ localeLabel(column.locale) }}</span>
                <span v-if="sortEntry(column)" class="th-sort" aria-hidden="true">
                  <v-icon size="14" :icon="sortEntry(column).order === 'asc' ? '$arrowUp' : '$arrowDown'" />
                  <span v-if="sortBy.length > 1" class="th-sort-rank">{{ sortRank(column) }}</span>
                </span>
              </button>
              <span v-else class="th-btn static">
                <span class="th-label">{{ column.label }}</span>
                <span v-if="showLocaleBadge && column.locale" class="th-badge">{{ localeLabel(column.locale) }}</span>
              </span>
            </th>
            <th scope="col" class="col-actions sticky-right"><span class="cms-visually-hidden">{{ $filters.translate('TL_ACTIONS') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="n in 8" :key="`skeleton-${n}`" class="skeleton-row" aria-hidden="true">
              <td :colspan="columns.length + 2"><span class="skeleton-bar" :style="{width: `${40 + ((n * 17) % 45)}%`}" /></td>
            </tr>
          </template>
          <template v-else>
            <tr v-if="windowState.padTop" class="spacer" aria-hidden="true" :style="{height: `${windowState.padTop}px`}"><td :colspan="columns.length + 2" /></tr>
            <tr
              v-for="(row, offset) in visibleRows" :key="row._id" class="data-row" :class="{selected: isSelected(row)}" :data-row="windowState.start + offset"
              :aria-rowindex="windowState.start + offset + 2" :aria-selected="isSelected(row) ? 'true' : 'false'" :tabindex="isActive(windowState.start + offset, -1) ? 0 : -1"
              @click="onRowClick($event, row)"
            >
              <td class="col-check sticky-left" data-cell="0" :tabindex="isActive(windowState.start + offset, 0) ? 0 : -1">
                <input
                  type="checkbox" class="cms-check" tabindex="-1" :checked="isSelected(row)" :aria-label="$filters.translate('TL_SELECT_ROW')"
                  @click.stop="onCheck($event, row)"
                >
              </td>
              <td
                v-for="(column, index) in columns" :key="column.key" :data-cell="index + 1" :tabindex="isActive(windowState.start + offset, index + 1) ? 0 : -1"
                :class="{'sticky-left first': index === 0, 'align-right': column.align === 'right', [`kind-${column.kind}`]: true}"
              >
                <table-cell :column="column" :record="row" :helpers="helpers" />
              </td>
              <td class="col-actions sticky-right" :data-cell="columns.length + 1" :tabindex="isActive(windowState.start + offset, columns.length + 1) ? 0 : -1">
                <span class="row-actions">
                  <button
                    type="button" class="cms-icon-btn" :tabindex="activeRow === windowState.start + offset ? 0 : -1" :title="$filters.translate('TL_EDIT_RECORD')"
                    :aria-label="`${$filters.translate('TL_EDIT_RECORD')}: ${rowName(row)}`" @click.stop="$emit('edit', row)"
                  >
                    <v-icon size="16" icon="$noteEditOutline" />
                  </button>
                  <button
                    type="button" class="cms-icon-btn danger" :tabindex="activeRow === windowState.start + offset ? 0 : -1" :title="$filters.translate('TL_DELETE_RECORD')"
                    :aria-label="`${$filters.translate('TL_DELETE_RECORD')}: ${rowName(row)}`" @click.stop="$emit('remove', row)"
                  >
                    <v-icon size="16" icon="$trashCanOutline" />
                  </button>
                </span>
              </td>
            </tr>
            <tr v-if="windowState.padBottom" class="spacer" aria-hidden="true" :style="{height: `${windowState.padBottom}px`}"><td :colspan="columns.length + 2" /></tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'
  import TableCell from '@c/TableCell.vue'
  import {
    distributeWidths, rowWindow, scrollTopForRow, moveFocus, selectionState, toggleAllIds, toggleId, selectRange, DENSITY_ROW_HEIGHT
  } from '@u/tableModel'

  const NARROW_WIDTH = 560
  const NARROW_FIRST_WIDTH = 150

  /**
   * The grid: a native table in its own scroll container with a sticky header row, sticky checkbox and first column,
   * a sticky actions column, fixed row heights and windowed rendering, sortable headers and grid keyboard navigation.
   * It only renders and reports intent (sort, select, edit, remove); RecordTable owns the data.
   */
  export default {
    components: { TableCell },
    props: {
      columns: { type: Array, default: () => [] },
      rows: { type: Array, default: () => [] },
      selected: { type: Array, default: () => [] },
      sortBy: { type: Array, default: () => [] },
      density: { type: String, default: 'default' },
      loading: { type: Boolean, default: false },
      label: { type: String, default: '' },
      showLocaleBadge: { type: Boolean, default: false },
      helpers: { type: Object, default: () => ({}) },
      rowName: { type: Function, default: (row) => _.get(row, '_id', '') }
    },
    emits: ['update:selected', 'sort', 'open', 'edit', 'remove'],
    data () {
      return {
        scrollTop: 0,
        viewportHeight: 600,
        viewportWidth: 0,
        scrolledX: false,
        canScrollRight: false,
        rowHeight: DENSITY_ROW_HEIGHT.default,
        headHeight: 40,
        checkWidth: 44,
        actionsWidth: 84,
        active: { row: 0, col: -1 },
        lastChecked: null,
        resizeObserver: null
      }
    },
    computed: {
      ids () {
        return _.map(this.rows, '_id')
      },
      selectionState () {
        return selectionState(this.selected, this.ids)
      },
      windowState () {
        return rowWindow({ scrollTop: this.scrollTop, viewportHeight: this.viewportHeight, rowHeight: this.rowHeight, total: this.rows.length })
      },
      visibleRows () {
        return this.rows.slice(this.windowState.start, this.windowState.end)
      },
      activeRow () {
        return this.active.row
      },
      // phones: the first column keeps a short sticky width so other columns stay reachable, actions scroll with the row
      isNarrow () {
        return this.viewportWidth > 0 && this.viewportWidth < NARROW_WIDTH
      },
      widths () {
        const widths = distributeWidths(this.columns, this.viewportWidth, this.checkWidth + this.actionsWidth)
        if (this.isNarrow && widths.length > 0) {
          widths[0] = Math.min(widths[0], NARROW_FIRST_WIDTH)
        }
        return widths
      },
      firstWidth () {
        return _.get(this.widths, '[0]', 0)
      },
      totalWidth () {
        return this.checkWidth + _.sum(this.widths) + this.actionsWidth
      }
    },
    watch: {
      density () {
        this.$nextTick(this.measure)
      },
      rows () {
        // keep the tab stop on an existing row, and the window inside the new length
        this.active = { row: _.clamp(this.active.row, 0, Math.max(0, this.rows.length - 1)), col: this.active.col }
        this.$nextTick(this.measure)
      },
      columns () {
        this.$nextTick(this.updateScrollState)
      }
    },
    mounted () {
      this.measure()
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.measure())
        this.resizeObserver.observe(this.$refs.scroller)
      }
    },
    beforeUnmount () {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
      }
    },
    methods: {
      localeLabel (locale) {
        return TranslateService.get(`TL_${_.toUpper(locale)}`)
      },
      // Real heights are measured (touch devices enlarge the rows), the constants are only the first guess
      measure () {
        const scroller = this.$refs.scroller
        if (!scroller) {
          return
        }
        this.viewportHeight = scroller.clientHeight
        this.viewportWidth = scroller.clientWidth
        // fixed column widths come from the design tokens
        const style = window.getComputedStyle(scroller)
        this.checkWidth = parseFloat(style.getPropertyValue('--cms-table-check-w')) || this.checkWidth
        this.actionsWidth = parseFloat(style.getPropertyValue('--cms-table-actions-w')) || this.actionsWidth
        const row = scroller.querySelector('tbody tr.data-row')
        const head = scroller.querySelector('thead tr')
        this.rowHeight = row ? row.getBoundingClientRect().height || this.rowHeight : DENSITY_ROW_HEIGHT[this.density] || this.rowHeight
        this.headHeight = head ? head.getBoundingClientRect().height || this.headHeight : this.headHeight
        this.updateScrollState()
      },
      updateScrollState () {
        const scroller = this.$refs.scroller
        if (!scroller) {
          return
        }
        this.scrolledX = scroller.scrollLeft > 0
        this.canScrollRight = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1
      },
      onScroll () {
        const scroller = this.$refs.scroller
        this.scrollTop = scroller.scrollTop
        this.updateScrollState()
      },
      // ---- sorting
      sortEntry (column) {
        return _.find(this.sortBy, { key: column.key })
      },
      sortRank (column) {
        return _.findIndex(this.sortBy, { key: column.key }) + 1
      },
      ariaSort (column) {
        if (!column.sortable) {
          return undefined
        }
        const entry = this.sortEntry(column)
        return !entry ? 'none' : entry.order === 'asc' ? 'ascending' : 'descending'
      },
      sortHint (column) {
        return `${TranslateService.get('TL_SORT_BY')}: ${column.label} (${TranslateService.get('TL_SORT_SHIFT_HINT')})`
      },
      // ---- selection
      isSelected (row) {
        return _.includes(this.selected, row._id)
      },
      toggleAll () {
        return toggleAllIds(this.selected, this.ids)
      },
      onCheck (event, row) {
        const next = event.shiftKey && this.lastChecked ? selectRange(this.selected, this.ids, this.lastChecked, row._id) : toggleId(this.selected, row._id)
        this.lastChecked = row._id
        this.$emit('update:selected', next)
      },
      onRowClick (event, row) {
        if (event.target.closest('a, button, input, .col-check')) {
          return
        }
        // a text selection made by dragging must not open the record
        const selection = window.getSelection && window.getSelection()
        if (selection && !selection.isCollapsed && selection.toString().length > 0) {
          return
        }
        this.$emit('open', row)
      },
      // ---- keyboard
      isActive (row, col) {
        return this.active.row === row && this.active.col === col
      },
      positionOf (target) {
        const tr = target && target.closest ? target.closest('tr[data-row]') : null
        if (!tr) {
          return null
        }
        const td = target.closest('td[data-cell]')
        return { row: Number(tr.dataset.row), col: td ? Number(td.dataset.cell) : -1 }
      },
      onFocusIn (event) {
        const position = this.positionOf(event.target)
        if (position) {
          this.active = position
        }
      },
      async focusPosition (position) {
        const scroller = this.$refs.scroller
        this.active = position
        const top = scrollTopForRow({ index: position.row, scrollTop: this.scrollTop, viewportHeight: this.viewportHeight, rowHeight: this.rowHeight, headerHeight: this.headHeight })
        if (top !== null) {
          scroller.scrollTop = top
          this.scrollTop = top
        }
        await this.$nextTick()
        const selector = position.col === -1 ? `tr[data-row="${position.row}"]` : `tr[data-row="${position.row}"] td[data-cell="${position.col}"]`
        const element = scroller.querySelector(selector)
        if (element) {
          element.focus()
        }
      },
      onKeydown (event) {
        const position = this.positionOf(event.target)
        if (!position) {
          return
        }
        const row = this.rows[position.row]
        const onControl = event.target.matches && event.target.matches('button, input, a')
        if (event.key === 'Enter' && !onControl && row) {
          event.preventDefault()
          this.$emit('open', row)
          return
        }
        if (event.key === ' ' && !onControl && row) {
          event.preventDefault()
          this.$emit('update:selected', toggleId(this.selected, row._id))
          this.lastChecked = row._id
          return
        }
        if ((event.ctrlKey || event.metaKey) && _.toLower(event.key) === 'a' && !onControl) {
          event.preventDefault()
          this.$emit('update:selected', _.union(this.selected, this.ids))
          return
        }
        if (event.key === 'Escape' && this.selected.length > 0 && !onControl) {
          this.$emit('update:selected', [])
          return
        }
        const pageSize = Math.max(1, Math.floor((this.viewportHeight - this.headHeight) / this.rowHeight) - 1)
        const next = moveFocus(position, event.key, { rowCount: this.rows.length, colCount: this.columns.length + 2, pageSize, ctrl: event.ctrlKey || event.metaKey })
        if (next !== position) {
          event.preventDefault()
          this.focusPosition(next)
        }
      }
    }
  }
</script>
