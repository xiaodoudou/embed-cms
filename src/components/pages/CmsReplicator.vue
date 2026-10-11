<template>
  <div class="plugin-wrapper cms-replicator">
    <div class="plugin-title">
      <h5>{{ $filters.translate('TL_REPLICATOR') }}</h5>
    </div>
    <p class="intro cms-text cms-text-muted">{{ $filters.translate('TL_REPLICATOR_INTRO') }}</p>
    <section class="cms-card" aria-labelledby="replicator-resources-title">
      <header class="cms-card-header">
        <h2 id="replicator-resources-title" class="cms-h3">{{ $filters.translate('TL_RESOURCES') }}</h2>
      </header>
      <div class="cms-card-body">
        <p v-if="loadError" class="load-error cms-callout is-error" role="alert">{{ loadError }}</p>
        <div v-if="loaded && shown.length > 0" class="cms-datatable-scroll">
          <table class="cms-datatable">
            <colgroup>
              <col class="col-name">
              <col class="col-direction">
              <col class="col-links">
              <col class="col-links">
            </colgroup>
            <thead>
              <tr>
                <th>{{ $filters.translate('TL_RESOURCE') }}</th>
                <th>{{ $filters.translate('TL_DIRECTION') }}</th>
                <th><span class="side-head is-receives"><v-icon icon="$arrowDown" size="small" />{{ $filters.translate('TL_RECEIVES_FROM') }}</span></th>
                <th><span class="side-head is-sends"><v-icon icon="$arrowUp" size="small" />{{ $filters.translate('TL_SENDS_TO') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="resource in shown" :key="resource.name">
                <td class="name">{{ resource.name }}</td>
                <td class="direction">
                  <span class="direction-pill" :class="`is-${resource.type}`">
                    <v-icon :icon="directionIcon(resource.type)" size="small" />
                    {{ $filters.translate(directionKey(resource.type)) }}
                  </span>
                  <span class="type cms-text-sm cms-text-muted">{{ resource.type }}</span>
                </td>
                <td class="receives">
                  <ul v-if="resource.receives.length > 0" class="links">
                    <li v-for="link in resource.receives" :key="link.peer" class="link is-receives">
                      <div class="link-head">
                        <span class="cms-badge" :class="badgeClass(link.state)">{{ $filters.translate(stateKey(link.state)) }}</span>
                        <span class="peer" :title="link.peer">{{ peerHost(link.peer) }}</span>
                        <span v-if="link.peerId" class="peer-id cms-text-sm cms-text-muted">{{ link.peerId }}</span>
                      </div>
                      <div v-if="link.error" class="link-error cms-text-sm cms-text-error">{{ link.error }}</div>
                      <div class="link-detail cms-text-sm cms-text-muted">{{ receivedText(link) }}</div>
                    </li>
                  </ul>
                  <span v-else class="none cms-text-muted">{{ $filters.translate('TL_NONE') }}</span>
                </td>
                <td class="sends">
                  <ul v-if="resource.sends.length > 0" class="links">
                    <li v-for="(peer, index) in resource.sends" :key="peer.peer + '-' + index" class="link is-sends">
                      <div class="link-head">
                        <span class="cms-badge is-success">{{ $filters.translate('TL_LINK_LIVE') }}</span>
                        <template v-if="hosts[peer.peer]">
                          <span class="peer">{{ hosts[peer.peer] }}</span>
                          <span class="peer-id cms-text-sm cms-text-muted">{{ peer.peer }}</span>
                        </template>
                        <span v-else class="peer">{{ peer.peer }}</span>
                      </div>
                      <div class="link-detail cms-text-sm cms-text-muted">{{ sentText(peer) }}</div>
                    </li>
                  </ul>
                  <span v-else class="none cms-text-muted">{{ $filters.translate('TL_NONE') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="loaded && shown.length === 0" class="cms-text-muted">{{ $filters.translate('TL_NO_REPLICATED_RESOURCES') }}</p>
        <p v-if="loaded && others > 0" class="others cms-text-sm cms-text-muted">{{ $filters.translate(others === 1 ? 'TL_N_OTHER_RESOURCES_ONE' : 'TL_N_OTHER_RESOURCES', { num: others }) }}</p>
      </div>
    </section>
  </div>
</template>
<script>
  import _ from 'lodash'
  import Dayjs from 'dayjs'
  import relativeTime from 'dayjs/plugin/relativeTime'
  import RequestService from '@s/RequestService'
  import TranslateService from '@s/TranslateService'
  import { directionKey, directionIcon, linkState, replicatedResources, peerHost, hostsById } from '@u/replication'

  Dayjs.extend(relativeTime)

  // how often the page asks the server how the links are doing
  const REFRESH = 2000

  // RequestService rejects with the fetch Response (no JSON) or the parsed JSON body ({ error })
  const errorText = (error) => _.get(error, 'error') || _.get(error, 'message') || (_.get(error, 'status') ? `HTTP ${error.status}` : _.toString(error))

  /**
   * The state of the replication, live: for each resource that replicates, the peers it receives from (and how each link
   * is doing) and the peers that pull it from this node. Nothing to start by hand: the links run by themselves. A peer is
   * named by its host, with its machine id next to it, on both sides.
   */
  export default {
    data() {
      return {
        resources: [],
        loaded: false,
        loadError: '',
        timer: null
      }
    },
    computed: {
      /** @returns {Array<object>} the resources that replicate */
      shown () {
        return replicatedResources(this.resources).shown
      },
      /** @returns {number} how many resources do not replicate */
      others () {
        return replicatedResources(this.resources).others
      },
      /** @returns {Object<string, string>} the host of each peer this node pulls from, by machine id */
      hosts () {
        return hostsById(this.resources)
      }
    },
    mounted() {
      this.refresh()
      this.timer = setInterval(() => this.refresh(), REFRESH)
    },
    beforeUnmount() {
      clearInterval(this.timer)
    },
    methods: {
      directionKey,
      directionIcon,
      peerHost,
      /**
       * @param {string} state
       * @returns {string} the translation key of the state of a link
       */
      stateKey (state) {
        return linkState(state).key
      },
      /**
       * @param {string} state
       * @returns {string} the class of its badge: its colour
       */
      badgeClass (state) {
        return `is-${linkState(state).tone}`
      },
      /**
       * @param {{received: number, lastReceivedAt: number|null, retryAt: number|null, state: string}} link
       * @returns {string} when the last change came in, or when the next try is
       */
      receivedText (link) {
        if (link.state === 'reconnecting' && link.retryAt) {
          return TranslateService.get('TL_NEXT_TRY', { time: Dayjs(link.retryAt).fromNow() })
        }
        return link.lastReceivedAt ? TranslateService.get('TL_LAST_CHANGE', { time: Dayjs(link.lastReceivedAt).fromNow() }) : TranslateService.get('TL_NO_CHANGE_YET')
      },
      /**
       * @param {{lastSentAt: number|null}} peer
       * @returns {string} when the last change went out to that peer
       */
      sentText (peer) {
        return peer.lastSentAt ? TranslateService.get('TL_LAST_CHANGE', { time: Dayjs(peer.lastSentAt).fromNow() }) : TranslateService.get('TL_NO_CHANGE_YET')
      },
      /** Asks the server how the replication is doing; a failure keeps what was shown and says why. */
      async refresh() {
        try {
          this.resources = await RequestService.get('../replicator/resources')
          this.loadError = ''
        } catch (error) {
          this.loadError = TranslateService.get('TL_REPLICATOR_LOAD_FAILED', { error: errorText(error) })
        } finally {
          this.loaded = true
        }
      }
    }
  }
</script>
<style lang="scss" scoped>
.cms-replicator {
  .intro {
    margin: 0 var(--cms-space-6) var(--cms-space-4);
    max-width: var(--cms-content-max);
  }
  .cms-card {
    margin: 0 var(--cms-space-6) var(--cms-space-6);
    max-width: var(--cms-content-max);
  }
  .col-name {
    width: 18%;
  }
  .col-direction {
    width: 14%;
  }
  .col-links {
    width: 34%;
  }
  // a darker head than the boxes of the links, so the columns are found at once
  thead th {
    background: var(--cms-surface-3);
    border-block-end-color: var(--cms-border-strong);
    vertical-align: middle;
  }
  td {
    vertical-align: top;
  }
  .name {
    font-weight: var(--cms-fw-semibold);
  }
  // one colour per side: what comes in (receives, downstream) is blue, what goes out (sends, upstream) is indigo; green stays
  // the colour of a live link
  .side-head {
    display: inline-flex;
    align-items: center;
    gap: var(--cms-space-1);
    &.is-receives .v-icon {
      color: var(--cms-info);
    }
    &.is-sends .v-icon {
      color: var(--cms-primary);
    }
  }
  .direction-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--cms-space-1);
    padding: 2px var(--cms-space-2) 2px var(--cms-space-1);
    border-radius: var(--cms-radius-pill);
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
    &.is-downstream {
      background: var(--cms-info-soft);
      color: var(--cms-info);
    }
    &.is-upstream {
      background: var(--cms-primary-soft);
      color: var(--cms-on-primary-soft);
    }
    &.is-normal {
      background: var(--cms-surface-2);
      color: var(--cms-text);
    }
  }
  .direction .type {
    display: block;
    margin-top: var(--cms-space-1);
    padding-left: var(--cms-space-1);
    font-family: var(--cms-font-mono);
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  // each link is a small box on the inset surface, edged with the colour of its side
  .link {
    padding: var(--cms-space-2) var(--cms-space-3);
    border-left: 3px solid transparent;
    border-radius: var(--cms-radius-sm);
    background: var(--cms-surface-2);
    &.is-receives {
      border-left-color: var(--cms-info);
    }
    &.is-sends {
      border-left-color: var(--cms-primary);
    }
  }
  .link-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-1) var(--cms-space-2);
  }
  .peer {
    font-family: var(--cms-font-mono);
    font-size: var(--cms-fs-sm);
    word-break: break-all;
  }
  .link-error,
  .link-detail {
    margin-top: 2px;
  }
  .others {
    margin: var(--cms-space-3) 0 0;
  }
}

@media (max-width: 599.98px) {
  .cms-replicator {
    .intro,
    .cms-card {
      margin-left: var(--cms-space-3);
      margin-right: var(--cms-space-3);
    }
  }
}
</style>
