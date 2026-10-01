<template>
  <div class="plugin-wrapper">
    <div class="plugin-title">
      <h5>{{ $filters.translate('TL_REPLICATOR') }}</h5>
    </div>
    <v-card elevation="0" class="cms-replicator">
      <div class="replicator-head">
        <p class="intro">{{ $filters.translate('TL_REPLICATOR_INTRO') }}</p>
        <v-btn variant="tonal" rounded density="comfortable" prepend-icon="$refresh" :loading="loading" @click="fetchResources">{{ $filters.translate('TL_REFRESH') }}</v-btn>
      </div>
      <p v-if="loadError" class="load-error" role="alert">{{ loadError }}</p>
      <v-table v-else density="comfortable">
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
            <td><code>{{ resource.type }}</code></td>
            <td>{{ $filters.translate(directionKey(resource.type)) }}</td>
            <td class="peers">
              <template v-if="hasPeers(resource)">{{ peersOf(resource) }}</template>
              <span v-else class="muted">{{ $filters.translate('TL_NO_PEERS') }}</span>
            </td>
            <td class="actions">
              <v-btn size="small" variant="tonal" rounded :disabled="!hasPeers(resource)" @click="syncResource(resource.name)">{{ $filters.translate('TL_SYNC_ALL') }}</v-btn>
              <v-btn size="small" variant="text" rounded :disabled="!hasPeers(resource)" @click="syncRecordPrompt(resource.name)">{{ $filters.translate('TL_SYNC_RECORD') }}</v-btn>
            </td>
          </tr>
          <tr v-if="!loading && resources.length === 0">
            <td colspan="5" class="muted">{{ $filters.translate('TL_NO_REPLICATED_RESOURCES') }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
    <app-dialog
      :model-value="showDialog" :title="$filters.translate('TL_SYNC_RECORD')" type="info" :confirm-text="$filters.translate('TL_SYNC')" :cancel-text="$filters.translate('TL_CANCEL')"
      @confirm="doSyncRecord" @cancel="showDialog = false"
    >
      <v-text-field v-model="recordId" :label="$filters.translate('TL_RECORD_ID')" @keydown.enter="doSyncRecord" />
    </app-dialog>
  </div>
</template>
<script>
  import _ from 'lodash'
  import AppDialog from '@c/AppDialog.vue'
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
      hasPeers(resource) {
        return !_.isEmpty(resource.peers)
      },
      peersOf(resource) {
        return _.map(resource.peers, peerLabel).join(', ')
      },
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
      syncResource(resource) {
        return this.runSync(`../replicator/sync/${encodeURIComponent(resource)}`, resource, () => this.syncResource(resource))
      },
      syncRecordPrompt(resource) {
        this.recordResource = resource
        this.showDialog = true
        this.recordId = ''
      },
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
@use '@a/scss/variables.scss' as *;
.cms-replicator {
  margin: var(--cms-space-4) var(--cms-space-6) var(--cms-space-6);
  padding: var(--cms-space-6);
  max-width: var(--cms-content-max);
  background-color: $layout-card-background;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  .replicator-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cms-space-4);
    margin-bottom: var(--cms-space-4);
  }
  .intro {
    margin: 0;
    color: var(--cms-text-muted);
    font-size: var(--cms-fs-sm);
  }
  .load-error {
    color: var(--cms-error);
  }
  .name {
    font-weight: var(--cms-fw-semibold);
  }
  .muted {
    color: var(--cms-text-muted);
  }
  code {
    font-family: var(--cms-font-mono);
    font-size: var(--cms-fs-sm);
  }
  .actions {
    white-space: nowrap;
    .v-btn + .v-btn {
      margin-left: var(--cms-space-2);
    }
  }
}

@media (max-width: 599.98px) {
  .cms-replicator {
    margin: var(--cms-space-3);
    padding: var(--cms-space-4);
    .replicator-head {
      flex-direction: column;
    }
  }
}
</style>
