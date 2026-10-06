<template>
  <div id="updates-notifier">
    <div v-if="debug" class="debug">
      <div class="status">
        <label> {{ $filters.translate('TL_WS_UPDATES_CONNECTION_STATUS') }}:</label>
        <span>{{ $filters.translate(getConnectionStatus()) }}</span>
      </div>
      <div class="messages">{{ receivedUpdate }}</div>
    </div>
    <div class="update-notification">
      <!-- :type="isSameRecord() ? 'warning' : 'info'" -->
      <v-alert
        v-if="receivedUpdate"
        variant="flat"
        max-width="400"
        :title="$filters.translate(getTitle(receivedUpdate))" density="compact"
        :close-label="$filters.translate('TL_WS_UPDATES_CLOSE')" closable
      >
        <div class="description" v-html="sanitizeHtml(describe())" />
        <v-btn rounded compact variant="flat" size="small" @click="reloadResource()">{{ $filters.translate('TL_WS_UPDATES_RELOAD') }}</v-btn>
      </v-alert>
    </div>
  </div>
</template>

<script>
  import { log } from '@u/log'
  import _ from 'lodash'
  import { sanitizeHtml } from '@u/sanitizeHtml'
  import LoginService from '@s/LoginService'
  import TranslateService from '@s/TranslateService'

  export default {
    props: {
      selectedResource: { type: Object, default: () => {} },
      selectedRecord: { type: [Object, Boolean], default: () => {} }
    },
    emits: ['reloadResource'],
    data() {
      return {
        debug: false,
        client: null,
        connecting: null,
        heatbeat: null,
        isConnecting: false,
        isConnected: false,
        reconnectAfter: 500,
        pingIntervalDuration: 30000,
        pingDelay: 5000,
        receivedUpdate: false,
        destroyed: false
      }
    },
    mounted() {
      this.connectToWebsocketServer()
    },
    beforeUnmount() {
      // no more heartbeat, no more reconnecting
      this.destroyed = true
      clearTimeout(this.heatbeat)
      clearTimeout(this.connecting)
      if (this.client) {
        this.client.onopen = this.client.onclose = this.client.onmessage = null
        this.client.close()
      }
    },
    methods: {
      sanitizeHtml,
      /** Emits reloadResource with the id of the updated record. */
      reloadResource() {
        this.$emit('reloadResource', _.get(this.receivedUpdate, 'data._id', false))
        this.receivedUpdate = false
      },
      /** @returns {'RECORD'|'RESOURCE'} the part of the translation keys */
      recordOrResource() {
        return this.isSameRecord() ? 'RECORD' : 'RESOURCE'
      },
      /** @returns {string} a translation key */
      getTitle() {
        return `TL_WS_UPDATES_${this.recordOrResource()}_TITLE`
      },
      /** @returns {string} a translation key */
      getDescription() {
        return `TL_WS_UPDATES_${this.recordOrResource()}_DESCRIPTION`
      },
      /** @returns {string} the translated description, with the name of the resource */
      describe() {
        return TranslateService.get(this.getDescription(), { resourceName: _.get(this.receivedUpdate, 'data.resource', '') })
      },
      /** @returns {boolean} whether the update is about the selected record */
      isSameRecord() {
        return _.get(this.receivedUpdate, 'data._id', '?') === _.get(this.selectedRecord, '_id', '??')
      },
      /** @returns {string} a translation key: connecting, connected or disconnected */
      getConnectionStatus() {
        if (this.isConnecting) {
          return 'TL_WS_UPDATES_CONNECTING'
        } else if (this.isConnected) {
          return 'TL_WS_UPDATES_CONNECTED'
        }
        return 'TL_WS_UPDATES_RECONNECTING'
      },
      /** Opens /_updates on the ws scheme of the page and binds the handlers. */
      connectToWebsocketServer() {
        const url = `${window.location.origin.replace(/^(http)/, 'ws')}/_updates`
        this.client = new WebSocket(url)
        _.each(['onopen', 'onclose', 'onmessage'], (key)=> this.client[key] = this[key])
      },
      onclose () {
        // log.debug('Websocket - onclose')
        this.isConnecting = false
        this.isConnected = false
        clearTimeout(this.heatbeat)
        clearTimeout(this.connecting)
        this.connecting = setTimeout(async () => {
          await this.connectToWebsocketServer()
        }, this.reconnectAfter)
      },
      onopen () {
        // log.debug('Websocket - onopen')
        this.onHeartbeat()
        this.isConnecting = false
        this.isConnected = true
      },
      /**
       * @param {Object} msg
       * @returns {boolean} whether _updatedBy is the logged-in user
       */
      isFromSelf(msg) {
        const user = _.get(LoginService, 'user', {})
        return _.get(msg, 'data._updatedBy', false) === `${user.group}~${user.username}`
      },
      /** @param {MessageEvent} event a JSON message: a ping is answered, an update is kept for the banner */
      onmessage (event) {
        const msg = JSON.parse(event.data)
        if (!_.get(msg, 'action', false)) {
          return log.debug('ws msg received without action:', msg)
        } else if (msg.action === 'ping') {
          return this.pong()
        } else if (msg.action === 'update' && !this.isFromSelf(msg)) {
          log.debug('received WS msg', msg)
          if (_.get(msg, 'data.resource', false) && msg.data.resource === this.selectedResource.name) {
            log.debug(`same ${this.isSameRecord(msg) ? 'record' : 'resource'} was edited`)
            this.receivedUpdate = msg
          }
        }
      },
      /** @param {Object} data sent as JSON; a failure is logged, not thrown */
      send (data) {
        try {
          this.client.send(JSON.stringify(data))
        } catch (error) {
          console.error('WebSocket::send: Error:', error)
        }
      },
      pong () {
        // log.debug('WebSocket::pong: Responded')
        this.send({ action: 'pong' })
        this.onHeartbeat()
      },
      /** Arms the timeout that closes the socket when the server stops pinging. */
      onHeartbeat () {
        clearTimeout(this.heatbeat)
        this.heatbeat = setTimeout(() => {
          log.debug('WebSocket::onHeartbeat: Timeout')
          this.client.close()
        }, this.pingIntervalDuration + this.pingDelay)
      }
    }
  }
</script>

<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
#updates-notifier {
  .debug {
    background: aqua;
    position: absolute;
    top: 16px;
    right: 16px;
    border: 2px solid black;
    margin: 16px;
    padding: 8px 16px;
    z-index: 4200;
  }
}
.update-notification {
  position: fixed;
  top: calc(var(--cms-appbar-height) + var(--cms-space-4));
  left: 50%;
  // max-width: 25vw;
  transform: translate(-50%, 0);
  z-index: 4200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  .v-btn {
    margin-top: 8px;
  }
  .v-alert-title {
    @include cta-text;
  }
  .v-alert__content {
    @include small-cta-text;
  }
  .v-alert-title {
    @include h5;
  }
}
</style>
