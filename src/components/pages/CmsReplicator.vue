<template>
  <div class="plugin-wrapper cms-replicator">
    <div class="plugin-title">
      <h5>{{ $filters.translate('TL_REPLICATOR') }}</h5>
    </div>
    <p class="intro cms-text cms-text-muted">{{ $filters.translate('TL_REPLICATOR_INTRO') }}</p>
    <section class="cms-card" aria-labelledby="replicator-resources-title">
      <header class="cms-card-header cms-row is-between">
        <h2 id="replicator-resources-title" class="cms-h3">{{ $filters.translate('TL_RESOURCES') }}</h2>
        <button type="button" class="refresh cms-btn is-secondary is-sm" :disabled="loading" @click="fetchResources">
          <span v-if="loading" class="cms-spinner" aria-hidden="true" />
          <v-icon v-else icon="$refresh" size="small" />
          {{ $filters.translate('TL_REFRESH') }}
        </button>
      </header>
      <div class="cms-card-body">
        <p v-if="loadError" class="load-error cms-callout is-error" role="alert">{{ loadError }}</p>
        <div v-else class="cms-datatable-scroll">
          <table class="cms-datatable is-hover">
            <thead>
              <tr>
                <th>{{ $filters.translate('TL_RESOURCE') }}</th>
                <th>{{ $filters.translate('TL_REPLICATION_TYPE') }}</th>
                <th>{{ $filters.translate('TL_DIRECTION') }}</th>
                <th>{{ $filters.translate('TL_PEERS') }}</th>
                <th>{{ $filters.translate('TL_ACTIONS') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="resource in resources" :key="resource.name">
                <td class="name">{{ resource.name }}</td>
                <td><code class="cms-code">{{ resource.type }}</code></td>
                <td>{{ $filters.translate(directionKey(resource.type)) }}</td>
                <td class="peers">
                  <template v-if="hasPeers(resource)">{{ peersOf(resource) }}</template>
                  <span v-else class="cms-text-muted">{{ $filters.translate('TL_NO_PEERS') }}</span>
                </td>
                <td class="actions">
                  <button type="button" class="sync-all cms-btn is-secondary is-sm" :disabled="!hasPeers(resource)" @click="syncResource(resource.name)">{{ $filters.translate('TL_SYNC_ALL') }}</button>
                  <button type="button" class="sync-record cms-btn is-tertiary is-sm" :disabled="!hasPeers(resource)" @click="syncRecordPrompt(resource.name)">{{ $filters.translate('TL_SYNC_RECORD') }}</button>
                </td>
              </tr>
              <tr v-if="!loading && resources.length === 0">
                <td colspan="5" class="cms-text-muted">{{ $filters.translate('TL_NO_REPLICATED_RESOURCES') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <app-dialog
      :model-value="showDialog" :title="$filters.translate('TL_SYNC_RECORD')" type="info" :confirm-text="$filters.translate('TL_SYNC')" :cancel-text="$filters.translate('TL_CANCEL')"
      @confirm="doSyncRecord" @cancel="showDialog = false"
    >
      <div class="cms-field">
        <label class="cms-label" for="replicator-record-id">{{ $filters.translate('TL_RECORD_ID') }}</label>
        <input id="replicator-record-id" v-model="recordId" class="cms-input" type="text" autocomplete="off" @keydown.enter="doSyncRecord">
      </div>
    </app-dialog>
  </div>
</template>
<script>
  import _ from 'lodash'
  import AppDialog from '@c/feedback/AppDialog.vue'
  import NotificationsService from '@s/NotificationsService'
  import RequestService from '@s/RequestService'
  import TranslateService from '@s/TranslateService'
  import { peerLabel, directionKey, syncOutcome } from '@u/replication'

  // RequestService rejects with the fetch Response (no JSON) or the parsed JSON body ({ error })
  const errorText = (error) => _.get(error, 'error') || _.get(error, 'message') || (_.get(error, 'status') ? `HTTP ${error.status}` : _.toString(error))

  export default {
    components: { AppDialog },
    data() {
      return {
        resources: [],
        loading: false,
        loadError: '',
        showDialog: false,
        recordId: '',
        recordResource: ''
      }
    },
    mounted() {
      this.fetchResources()
    },
    methods: {
      directionKey,
      /**
       * @param {{peers: Array}} resource
       * @returns {boolean}
       */
      hasPeers(resource) {
        return !_.isEmpty(resource.peers)
      },
      /**
       * @param {{peers: Array}} resource
       * @returns {string} their labels, comma separated
       */
      peersOf(resource) {
        return _.map(resource.peers, peerLabel).join(', ')
      },
      /** Loads the resources and their peers from the replicator plugin. */
      async fetchResources() {
        this.loading = true
        this.loadError = ''
        try {
          this.resources = await RequestService.get('../replicator/resources')
        } catch (error) {
          this.resources = []
          this.loadError = TranslateService.get('TL_REPLICATOR_LOAD_FAILED', { error: errorText(error) })
        } finally {
          this.loading = false
        }
      },
      // the server answers 200 even when peers failed: the toast follows the result of each peer
      async runSync(url, name, retry) {
        NotificationsService.send(TranslateService.get('TL_SYNC_STARTED', { name }), 'info')
        try {
          const outcome = syncOutcome(await RequestService.post(url))
          if (outcome.status === 'ok') {
            NotificationsService.send(TranslateService.get('TL_SYNC_FINISHED', { name }), 'success')
          } else if (outcome.status === 'none') {
            NotificationsService.send(TranslateService.get('TL_SYNC_NO_PEER', { name }), 'warn')
          } else {
            NotificationsService.send(TranslateService.get('TL_SYNC_PEERS_FAILED', { name, failed: outcome.failed.length, total: outcome.total }), 'error', {
              detail: _.map(outcome.failed, (entry) => `${entry.peer}: ${entry.error}`).join('\n'),
              detailLabel: 'TL_COPY_ERRORS',
              actionLabel: TranslateService.get('TL_RETRY'),
              action: retry
            })
          }
        } catch (error) {
          NotificationsService.send(TranslateService.get('TL_SYNC_FAILED', { name, error: errorText(error) }), 'error', { actionLabel: TranslateService.get('TL_RETRY'), action: retry })
        }
      },
      /**
       * @param {string} resource its name
       * @returns {Promise}
       */
      syncResource(resource) {
        return this.runSync(`../replicator/sync/${encodeURIComponent(resource)}`, resource, () => this.syncResource(resource))
      },
      /** @param {string} resource opens the dialog asking for a record id */
      syncRecordPrompt(resource) {
        this.recordResource = resource
        this.showDialog = true
        this.recordId = ''
      },
      /**
       * Syncs the record whose id was typed; nothing without one.
       * @returns {Promise|undefined}
       */
      doSyncRecord() {
        if (!this.recordId) {
          return
        }
        const resource = this.recordResource
        const recordId = this.recordId
        this.showDialog = false
        const sync = () => this.runSync(`../replicator/sync/${encodeURIComponent(resource)}/${encodeURIComponent(recordId)}`, `${resource} ${recordId}`, sync)
        return sync()
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
  .name {
    font-weight: var(--cms-fw-semibold);
  }
  .actions {
    white-space: nowrap;
    .cms-btn + .cms-btn {
      margin-left: var(--cms-space-2);
    }
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
