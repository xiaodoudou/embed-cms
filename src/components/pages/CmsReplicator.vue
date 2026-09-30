<template>
  <div class="cms-replicator">
    <h2>Replicator Resources</h2>
    <v-btn @click="fetchResources">Refresh</v-btn>
    <v-table>
      <thead>
        <tr>
          <th>Resource</th>
          <th>Type</th>
          <th>Direction</th>
          <th>Peers</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="resource in resources" :key="resource.name">
          <td>{{ resource.name }}</td>
          <td>{{ resource.type }}</td>
          <td>{{ resource.direction }}</td>
          <td>{{ resource.peers.join(', ') }}</td>
          <td>
            <v-btn size="small" @click="syncResource(resource.name)">Sync All</v-btn>
            <v-btn size="small" @click="syncRecordPrompt(resource.name)">Sync Record</v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>
    <app-dialog :model-value="showDialog" title="Sync record" type="info" confirm-text="Sync" cancel-text="Cancel" @confirm="doSyncRecord" @cancel="showDialog = false">
      <v-text-field v-model="recordId" label="Record ID" @keydown.enter="doSyncRecord" />
    </app-dialog>
  </div>
</template>
<script>
  import AppDialog from '@c/AppDialog.vue'
  import NotificationsService from '@s/NotificationsService'

  export default {
    components: { AppDialog },
    data() {
      return {
        resources: [],
        showDialog: false,
        recordId: '',
        recordResource: ''
      }
    },
    mounted() {
      this.fetchResources()
    },
    methods: {
      async fetchResources() {
        const res = await fetch('/replicator/resources')
        this.resources = await res.json()
      },
      async syncResource(resource) {
        NotificationsService.send(`Sync started for ${resource}`, 'info')
        try {
          const res = await fetch(`/replicator/sync/${resource}`, { method: 'POST' })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          NotificationsService.send(`Sync finished for ${resource}`, 'success')
        } catch (error) {
          NotificationsService.send(`Sync failed for ${resource}: ${error.message}`, 'error', { actionLabel: 'Retry', action: () => this.syncResource(resource) })
        }
      },
      syncRecordPrompt(resource) {
        this.recordResource = resource
        this.showDialog = true
        this.recordId = ''
      },
      async doSyncRecord() {
        if (!this.recordId) return
        const resource = this.recordResource
        const recordId = this.recordId
        this.showDialog = false
        NotificationsService.send(`Sync started for ${resource} record`, 'info')
        try {
          const res = await fetch(`/replicator/sync/${resource}/${recordId}`, { method: 'POST' })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          NotificationsService.send(`Sync finished for ${resource} record`, 'success')
        } catch (error) {
          NotificationsService.send(`Sync failed for ${resource} record: ${error.message}`, 'error')
        }
      }
    }
  }
</script>
<style scoped>
.cms-replicator {
  padding: var(--cms-space-6);
  max-width: var(--cms-content-max);
}
.cms-replicator h2 {
  margin: 0 0 var(--cms-space-3);
  font-size: var(--cms-fs-xl);
  font-weight: var(--cms-fw-semibold);
}
.cms-replicator td .v-btn + .v-btn {
  margin-left: var(--cms-space-2);
}
</style>
