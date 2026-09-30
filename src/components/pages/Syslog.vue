<template>
  <div class="syslog" :class="{wrapped: wrap}">
    <div class="buttons" role="toolbar" :aria-label="$filters.translate('TL_SYSLOG_TOOLS')">
      <button type="button" class="item autoscroll" :class="{active: autoscroll}" :aria-pressed="autoscroll ? 'true' : 'false'" :aria-label="$filters.translate('TL_AUTO_SCROLL')" :title="$filters.translate('TL_AUTO_SCROLL')" @click="onClickAutoscroll">
        <v-icon v-if="autoscroll" icon="$lockOutline" />
        <v-icon v-else icon="$lockOpenOutline" />
      </button>
      <button type="button" class="item clear" :aria-label="$filters.translate('TL_CLEAR')" :title="$filters.translate('TL_CLEAR')" @click="onClickClear"><v-icon icon="$trashCanOutline" /></button>
      <button type="button" class="item refresh" :aria-label="$filters.translate('TL_REFRESH')" :title="$filters.translate('TL_REFRESH')" @click="onClickRefresh"><v-icon icon="$refresh" /></button>
      <button type="button" class="item wrap" :class="{active: wrap}" :aria-pressed="wrap ? 'true' : 'false'" :aria-label="$filters.translate('TL_WRAP_LINES')" :title="$filters.translate('TL_WRAP_LINES')" @click="toggleWrap"><v-icon icon="$wrap" /></button>
      <input ref="searchInput" v-model="searchKey" :class="{'is-sift': searchKey && searchKey.search('sift:') === 0}" class="item search" :placeholder="$filters.translate('TL_SEARCH')" :aria-label="$filters.translate('TL_SEARCH')" @input="onInputSearch" @keydown.esc="onSearchEscape">
      <button v-if="searchKey && searchKey.length > 0" type="button" class="item clear-search" :aria-label="$filters.translate('TL_CLEAR_SEARCH')" :title="$filters.translate('TL_CLEAR_SEARCH')" @click="onClickClearSearch"><v-icon icon="$close" /></button>
      <div v-if="filterOutLines > 0" class="item filter-out" role="status"><v-icon icon="$target" />{{ filterOutLines }} lines are filter out</div>
      <div class="item logs-raised-flags">
        <button v-if="warningQty >= 0" type="button" class="flag-item flag-warning" :aria-label="$filters.translate('TL_WARNINGS') + ': ' + warningQty" @click="filterLevel(1)"><v-icon icon="$flagOutline" /> {{ warningQty }}</button>
        <button v-if="errorQty >= 0" type="button" class="flag-item flag-error" :aria-label="$filters.translate('TL_ERRORS') + ': ' + errorQty" @click="filterLevel(2)"><v-icon icon="$alertBoxOutline" /> {{ errorQty }}</button>
      </div>
    </div>
    <div class="log-viewer-wrapper">
      <div v-if="error" class="error-syslog">
        {{ $filters.translate('TL_ERROR_RETRIEVE_SYSLOG') }}
      </div>
      <RecycleScroller
        ref="virtualScroller"
        v-slot="{ item }"
        class="scroller"
        :items="displayLines"
        :item-size="wrap ? null : 20"
        size-field="rowHeight"
        key-field="id"
        @scroll="detectScroll"
      >
        <div class="log-line" :class="[levelClass(item), { 'selected': selectedLineId === item.id, 'wrapping': wrap }]">
          <span class="line-number" @click="onLineNumberClick(item.id, $event)">{{ item.id }}</span>
          <div class="line-content" v-html="highlightLogLine(item)" />
        </div>
      </RecycleScroller>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { sanitizeHtml } from '@u/sanitizeHtml'
  import sift from 'sift'
  import JSON5 from 'json5'
  import stripAnsi from 'strip-ansi'
  import { readPreference, writePreference } from '@u/preferences'
  import { columnsFor, withRowHeights } from '@u/logWrap'

  // the page keeps this many lines; the server keeps its own backlog (syslog.max, 2000 by default)
  const MAX_LINES = 5000

  export default {
    data () {
      return {
        timer: null,
        isLoading: true,
        sysLog: [],
        error: false,
        scrollBottom: true,
        data: '',
        count: 0,
        destroyed: false,
        autoscroll: true,
        lastId: -1,
        tempId: 0,
        logLines: [],
        filterOutLines: 0,
        searchKey: '',
        warningQty: 0,
        errorQty: 0,
        ignoreNextScrollEvent: false,
        fakeData: [],
        eventSource: false,
        processTimeout: null,
        currentDisplayableLines: [],
        targetLogIdAfterClear: null,
        isHandlingGutterClick: false,
        selectedLineId: null,
        shouldScrollToSelectedLine: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        pendingLines: [],
        flushHandle: null,
        // off by default: long lines scroll sideways; on, they continue on the next row when the window is too narrow
        wrap: readPreference('syslog.wrap', false) === true,
        columns: 120,
        resizeObserver: null
      }
    },
    computed: {
      displayLines () {
        return this.wrap ? withRowHeights(this.currentDisplayableLines, this.columns, (line) => stripAnsi(_.get(line, 'line', ''))) : this.currentDisplayableLines
      }
    },
    async mounted () {
      await this.$nextTick()
      this.connectToLogStream()
      await this.$nextTick()
      this.measureColumns()
      const scroller = _.get(this.$refs, 'virtualScroller.$el')
      if (scroller && typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.measureColumns())
        this.resizeObserver.observe(scroller)
      }
    },
    async unmounted () {
      this.destroyed = true
      clearTimeout(this.flushHandle)
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
      }
      this.disconnectFromLogStream()
    },
    methods: {
      toggleWrap () {
        this.wrap = !this.wrap
        writePreference('syslog.wrap', this.wrap)
        this.measureColumns()
      },
      // how many characters fit on a row now: the width of the list less the line number gutter
      measureColumns () {
        const scroller = _.get(this.$refs, 'virtualScroller.$el')
        if (!scroller) {
          return
        }
        const probe = document.createElement('span')
        probe.className = 'line-content'
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:var(--cms-font-mono);font-size:var(--cms-fs-sm)'
        probe.textContent = 'M'.repeat(50)
        scroller.appendChild(probe)
        const charWidth = probe.getBoundingClientRect().width / 50
        scroller.removeChild(probe)
        // 74px line number, 3px border, 8px padding, and room for the scrollbar
        this.columns = columnsFor(scroller.clientWidth - 74 - 3 - 8 - 12, charWidth)
      },
      onLineNumberClick(id) {
        this.selectedLineId = id
        this.autoscroll = false
        this.searchKey = ''
        this.shouldScrollToSelectedLine = true
        this.updateSysLog()
      },
      highlightLogLine(lineOrItem) {
        return lineOrItem ? sanitizeHtml(_.get(lineOrItem, 'html', _.get(lineOrItem, 'line', lineOrItem))) : ''
      },
      disconnectFromLogStream () {
        try {
          clearTimeout(this.timer)
          if (this.eventSource) {
            this.eventSource.close()
          }
        } catch (error) {
          console.error(`Error disconnecting from log stream: ${error.message}`)
        }
      },
      scrollToBottomIfEnabled () {
        if (this.isHandlingGutterClick) {
          return
        }
        if (this.shouldScrollToLastLog()) {
          this.ignoreNextScrollEvent = true
          this.$nextTick(() => {
            const lastIndex = this.currentDisplayableLines.length - 1
            try {
              this.$refs.virtualScroller.scrollToItem(lastIndex)
            } catch (error) {
              console.error('Failed to scroll to bottom:', error)
            }
          })
        }
      },
      connectToLogStream () {
        this.$loading.start('_syslog')
        this.disconnectFromLogStream()
        this.timer = setTimeout(() => {
          this.eventSource = new EventSource(`${window.location.pathname}../api/_syslog`)
          this.eventSource.onmessage = (event) => {
            this.$loading.stop('_syslog')
            this.reconnectAttempts = 0
            try {
              const json = JSON.parse(event.data)
              if (_.get(json, 'id', false) && _.get(json, 'line', false)) {
                json.size = _.get(`${this.calculateLineNumberSpacing(json.id)} ${json.line}`, 'length', 0)
                if (json.size > 0) {
                  // frozen: a log line never changes, so Vue does not have to make it reactive (thousands of them)
                  this.pendingLines.push(Object.freeze(json))
                  this.error = false
                }
              }
            } catch (error) {
              console.error('Failed to parse SSE:', error)
            }
            this.scheduleFlush()
          }
          this.eventSource.addEventListener('end', () => {
            this.$loading.stop('_syslog')
            this.eventSource.close()
            console.warn('Log stream ended')
          })
          this.eventSource.onerror = (error) => {
            this.$loading.stop('_syslog')
            this.error = "Error in SSE connection"
            console.error(`${this.error}:`, error)
            this.eventSource.close()
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++
              const reconnectDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
              console.warn(`Attempting to reconnect in ${reconnectDelay}ms (attempt ${this.reconnectAttempts})`)
              setTimeout(() => this.connectToLogStream(), reconnectDelay)
            } else {
              this.error = 'Failed to connect to syslog stream after multiple attempts.'
              console.error(this.error)
            }
          }
        }, 0)
      },
      // The backlog arrives as one message per line (up to 2000): handle them in batches, once per frame
      scheduleFlush () {
        if (this.flushHandle) {
          return
        }
        this.flushHandle = setTimeout(() => {
          this.flushHandle = null
          this.flushPending()
        }, 50)
      },
      flushPending () {
        if (this.pendingLines.length === 0) {
          return
        }
        this.logLines = _.takeRight(this.logLines.concat(this.pendingLines), MAX_LINES)
        this.pendingLines = []
        if (!this.isHandlingGutterClick) {
          if (this.autoscroll) {
            this.ignoreNextScrollEvent = true
            this.scrollToBottomIfEnabled()
          }
          this.updateSysLog()
        }
      },
      levelClass (item) {
        const level = _.get(item, 'level', 0)
        return level >= 2 ? 'level-error' : level === 1 ? 'level-warn' : level < 0 ? 'level-quiet' : 'level-info'
      },
      filterLevel (level) {
        this.searchKey = `sift:{level: {$gte: ${level}}}`
        this.updateSysLog()
      },
      async detectScroll () {
        if (this.ignoreNextScrollEvent) {
          this.ignoreNextScrollEvent = false
          return
        }
        if (this.isHandlingGutterClick) {
          return
        }
        const scrollerEl = this.$refs.virtualScroller?.$el
        if (!scrollerEl) {
          return
        }
        const scrollHeight = scrollerEl.scrollHeight
        const scrollTop = scrollerEl.scrollTop
        const clientHeight = scrollerEl.clientHeight
        await this.$nextTick()
        if (scrollTop + clientHeight >= scrollHeight - 1) {
          if (_.isEmpty(this.searchKey) && !this.isHandlingGutterClick) {
            this.autoscroll = true
          }
        } else {
          if (!this.isHandlingGutterClick) {
            this.autoscroll = false
          }
        }
      },
      onInputSearch () {
        this.selectedLineId = null
        this.updateSysLog()
      },
      // Escape clears the filter, or leaves the field when it is already empty; focus stays in the field after clearing
      onSearchEscape (event) {
        if (this.searchKey) {
          event.stopPropagation()
          this.onClickClearSearch()
          if (this.$refs.searchInput) {
            this.$refs.searchInput.focus()
          }
        } else if (this.$refs.searchInput) {
          this.$refs.searchInput.blur()
        }
      },
      clearFiltering() {
        this.searchKey = ''
        this.isHandlingGutterClick = false
      },
      onClickRefresh () {
        this.error = false
        this.pendingLines = []
        this.logLines = []
        this.sysLog = []
        this.clearFiltering()
        this.updateSysLog()
        this.lastId = -1
        // the backlog is only sent when a client connects: reconnect to get the lines back
        this.reconnectAttempts = 0
        this.connectToLogStream()
      },
      onClickClearSearch () {
        this.clearFiltering()
        this.updateSysLog()
      },
      shouldScrollToLastLog() {
        return this.autoscroll && this.$refs.virtualScroller && _.isArray(this.currentDisplayableLines) && this.currentDisplayableLines.length > 0
      },
      onClickAutoscroll () {
        this.autoscroll = !this.autoscroll
        if (this.shouldScrollToLastLog()) {
          this.$nextTick(() => {
            const lastIndex = this.currentDisplayableLines.length - 1
            try {
              this.$refs.virtualScroller.scrollToItem(lastIndex)
            } catch (error) {
              console.error('Failed to scroll to bottom on autoscroll:', error)
            }
          })
        }
      },
      onClickClear () {
        this.logLines = []
        this.sysLog = []
        this.clearFiltering()
        this.updateSysLog()
      },
      calculateLineNumberSpacing (line) {
        return _.padStart(line, 8, '0') + ' |'
      },
      filterLinesBySearch(lines) {
        const lowerSearchKey = _.toLower(this.searchKey)
        if (this.searchKey && this.searchKey.search('sift:') === 0) {
          try {
            const query = JSON5.parse(this.searchKey.substr(5))
            return lines.filter(sift(query))
          } catch (error) {
            console.error('Error parsing sift query:', error)
          }
        } else if (!_.isEmpty(this.searchKey)) {
          return _.filter(lines, lineItem => {
            const lineContent = _.isString(lineItem.line) ? lineItem.line : ''
            const strippedLine = stripAnsi(lineContent)
            return _.includes(_.toLower(strippedLine), lowerSearchKey)
          })
        }
      },
      async updateSysLog () {
        clearTimeout(this.processTimeout)
        this.processTimeout = setTimeout(async () => {
          let lines = _.uniqBy(this.logLines, 'id')
          const byLevel = _.groupBy(this.logLines, 'level')
          this.warningQty = _.get(byLevel, '[1].length', 0)
          this.errorQty = _.get(byLevel, '[2].length', 0)
          let shouldPositionToTarget = this.targetLogIdAfterClear !== null
          let targetLogId = this.targetLogIdAfterClear
          let selectedLogId = null
          if (shouldPositionToTarget && targetLogId !== null) {
            selectedLogId = targetLogId
            this.targetLogIdAfterClear = null
          } else if (this.selectedLineId) {
            selectedLogId = this.selectedLineId
          }
          if (!_.isEmpty(this.searchKey)) {
            lines = this.filterLinesBySearch(lines)
          }
          this.currentDisplayableLines = lines
          this.filterOutLines = _.get(this.logLines, 'length', 0) - _.get(this.currentDisplayableLines, 'length', 0)
          if (!this.$refs.virtualScroller) {
            return this.$forceUpdate()
          }
          if (this.isHandlingGutterClick && !shouldPositionToTarget) {
            return
          }
          if (selectedLogId) {
            await this.$nextTick()
            let targetIdx = _.findIndex(this.currentDisplayableLines, {id: selectedLogId})
            if (targetIdx === -1) {
              this.currentDisplayableLines = _.uniqBy(this.logLines, 'id')
              await this.$nextTick()
              targetIdx = _.findIndex(this.currentDisplayableLines, {id: selectedLogId})
            }
            if (targetIdx !== -1) {
              try {
                this.selectedLineId = selectedLogId
                if (this.shouldScrollToSelectedLine) {
                  this.$refs.virtualScroller.scrollToItem(targetIdx - 15)
                  this.shouldScrollToSelectedLine = false
                }
                setTimeout(() => {
                  if (shouldPositionToTarget) {
                    this.isHandlingGutterClick = false
                  }
                }, 50)
              } catch (error) {
                console.error('Error scrolling to selected line after update:', error)
              }
            }
          }
          if (!selectedLogId || !this.isHandlingGutterClick) {
            this.scrollToBottomIfEnabled()
          }
          this.$forceUpdate()
        }, 300)
      }
    },
  }

</script>

<style lang="scss" scoped>
.syslog {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  justify-content: flex-start;
  align-items: stretch;
  position: relative;
  height: 100%;
  min-width: 0;
  background: var(--cms-terminal-bg);
  color: var(--cms-terminal-fg);

  .buttons {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: stretch;
    min-height: 44px;
    background: var(--cms-terminal-bar);
    border-bottom: 1px solid var(--cms-terminal-border);
    font-size: var(--cms-fs-sm);

    .item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      background: transparent;
      border: 0;
      border-right: 1px solid var(--cms-terminal-border);
      color: var(--cms-terminal-muted);
      font: inherit;
      cursor: pointer;
      box-sizing: border-box;
      transition: background-color var(--cms-motion-fast) var(--cms-ease);

      .v-icon {
        color: var(--cms-terminal-fg);
      }

      &:hover,
      &:focus-visible {
        background-color: var(--cms-terminal-hover);
      }

      &:focus-visible {
        outline: 2px solid var(--cms-terminal-accent);
        outline-offset: -2px;
      }

      &.autoscroll.active,
      &.wrap.active {
        background: var(--cms-terminal-bg);
        box-shadow: inset 0 -2px 0 var(--cms-terminal-accent);
      }

      &.clear-search {
        border-right: 0;
      }

      &.search {
        flex: 1 1 180px;
        max-width: 360px;
        justify-content: flex-start;
        padding: 0 var(--cms-space-3);
        background-color: var(--cms-terminal-bg);
        color: var(--cms-terminal-fg);
        cursor: text;
        &::placeholder {
          color: var(--cms-terminal-muted);
        }
        &.is-sift {
          color: var(--cms-log-ok);
        }
        &:focus-visible {
          background-color: var(--cms-terminal-bg);
        }
      }

      &.filter-out,
      &.logs-raised-flags {
        cursor: default;
        gap: var(--cms-space-2);
        padding: 0 var(--cms-space-3);
        border-right: 0;
        .v-icon {
          color: var(--cms-terminal-accent);
        }
        &:hover {
          background: transparent;
        }
      }

      &.logs-raised-flags {
        margin-left: auto;
        .flag-item {
          display: inline-flex;
          align-items: center;
          gap: var(--cms-space-1);
          min-height: 32px;
          padding: 0 var(--cms-space-2);
          border: 1px solid var(--cms-terminal-border);
          border-radius: var(--cms-radius-sm);
          background: transparent;
          color: var(--cms-terminal-fg);
          font: inherit;
          cursor: pointer;
          &:hover {
            background: var(--cms-terminal-hover);
          }
          &:focus-visible {
            outline: 2px solid var(--cms-terminal-accent);
            outline-offset: 1px;
          }
          &.flag-error .v-icon {
            color: var(--cms-log-error);
          }
          &.flag-warning .v-icon {
            color: var(--cms-log-warn);
          }
        }
      }
    }
  }

  .log-viewer-wrapper {
    position: relative;
    background-color: var(--cms-terminal-bg);
    flex-grow: 1;
    min-height: 0;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    .scroller {
      height: 100%;
      width: 100%;
      background-color: var(--cms-terminal-bg);
    }
    .log-line {
      display: flex;
      font-family: var(--cms-font-mono);
      font-size: var(--cms-fs-sm);
      line-height: 20px;
      color: var(--cms-terminal-fg);
      cursor: pointer;
      border-left: 3px solid transparent;

      &:hover {
        background-color: var(--cms-terminal-hover);
      }
      &.selected {
        font-weight: 700 !important;
        border-left-color: var(--cms-terminal-accent);
        background-color: var(--cms-terminal-hover);
      }
      .line-number {
        display: inline-block;
        width: 74px;
        text-align: right;
        background-color: var(--cms-terminal-bar);
        color: var(--cms-terminal-muted);
        padding-right: 8px;
        cursor: pointer;
        user-select: none;
        flex-shrink: 0;

        &:hover {
          background-color: var(--cms-terminal-hover);
          color: var(--cms-terminal-accent);
        }
      }
      .line-content {
        flex: 1;
        padding-left: 8px;
        white-space: pre;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      // wrapped: a long line continues on the next row instead of scrolling sideways
      &.wrapping .line-content {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    }
  }
}
.error-syslog {
  text-align: center;
  background-color: var(--cms-error);
  color: var(--cms-on-primary);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  padding: var(--cms-space-2);
  z-index: 1;
}

// log lines are coloured by level (the server detects it); ANSI colours inside a line still win
.log-line {
  &.level-error .line-content {
    color: var(--cms-log-error);
  }
  &.level-warn .line-content {
    color: var(--cms-log-warn);
  }
  &.level-quiet .line-content {
    color: var(--cms-terminal-muted);
  }
}
</style>
