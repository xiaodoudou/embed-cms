<template>
  <div class="cms-config">
    <v-card>
      <v-card-title>
        <span class="text-h5">CMS Configuration Editor</span>
        <v-spacer />
        <v-chip :color="hasChanges ? 'warning' : 'success'" variant="flat" size="small">
          {{ hasChanges ? 'Modified' : 'Saved' }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <v-alert v-if="alert.show" :type="alert.type" class="mb-4" closable role="alert" @click:close="alert.show = false">
          {{ alert.message }}
        </v-alert>
        <v-textarea v-model="configContent" rows="20" aria-label="CMS configuration (JSON)" spellcheck="false" variant="outlined" :error="!isValidJson" :error-messages="jsonError" :disabled="loading" class="mb-4" @input="validateJson" />
        <div class="d-flex justify-end">
          <v-btn color="secondary" :disabled="loading" class="mr-2" @click="loadConfig">
            <v-icon left icon="$refresh" /> Reset
          </v-btn>

          <v-btn color="primary" :disabled="!isValidJson || loading || !hasChanges" :loading="loading" @click="saveConfig">
            <v-icon left icon="$contentSave" /> Save & Restart Server
          </v-btn>
        </div>
        <v-divider class="my-4" />
        <v-card variant="outlined" class="mt-4">
          <v-card-title class="text-subtitle-1">
            <v-icon left icon="$information" /> Information
          </v-card-title>
          <v-card-text class="text-caption">
            <p><strong>Warning:</strong> Editing the CMS configuration will restart the server automatically.</p>
            <p>Make sure the JSON is valid before saving. Invalid JSON will prevent the server from starting.</p>
            <p>Always backup your configuration before making significant changes.</p>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>
  </div>
</template>

<script>
  export default {
    name: 'CmsConfig',
    data() {
      return {
        configContent: '',
        originalContent: '',
        isValidJson: true,
        jsonError: '',
        loading: false,
        alertTimeout: false,
        alert: {
          show: false,
          type: 'success',
          message: ''
        }
      }
    },
    computed: {
      hasChanges() {
        return this.configContent !== this.originalContent
      }
    },
    async mounted() {
      await this.loadConfig()
    },
    methods: {
      async loadConfig() {
        this.loading = true
        try {
          const response = await fetch(`${window.location.pathname}/cms-config`)
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          const config = await response.json()
          this.configContent = JSON.stringify(config, null, 2)
          this.originalContent = this.configContent
          this.validateJson()
        } catch (error) {
          console.error('Error loading config:', error)
          this.showAlert('error', 'Failed to load configuration: ' + error.message)
        } finally {
          this.loading = false
        }
      },

      validateJson() {
        try {
          JSON.parse(this.configContent)
          this.isValidJson = true
          this.jsonError = ''
        } catch (error) {
          this.isValidJson = false
          this.jsonError = 'Invalid JSON: ' + error.message
        }
      },

      async saveConfig() {
        if (!this.isValidJson) {
          return this.showAlert('error', 'Please fix JSON errors before saving')
        }
        // Show confirmation dialog for server restart
        const confirmed = await window.DialogService.ask({
          event: 'saveConfig',
          destructive: true,
          title: 'Save and restart the server?',
          message: 'Saving will restart the server. Are you sure you want to continue?',
          confirm: 'Save and restart',
          cancel: 'Cancel'
        })
        if (!confirmed) {
          return
        }
        this.loading = true
        try {
          const parsedConfig = JSON.parse(this.configContent)
          const response = await fetch('/admin/cms-config', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(parsedConfig)
          })
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(errorText || `HTTP error! status: ${response.status}`)
          }
          await response.json() // Consume the response but don't store it
          this.originalContent = this.configContent
          this.showAlert('success', 'Configuration saved successfully! Server will restart shortly.')
          // Show notification that server is restarting
          setTimeout(() => {
            this.showAlert('info', 'Server is restarting... Please refresh the page in a few seconds.')
          }, 1000)
          // Attempt to reload the page after a delay
          setTimeout(() => {
            window.location.reload()
          }, 5000)
        } catch (error) {
          console.error('Error saving config:', error)
          this.showAlert('error', 'Failed to save configuration: ' + error.message)
        } finally {
          this.loading = false
        }
      },
      showAlert(type, message) {
        this.alert = {
          show: true,
          type: type,
          message: message
        }
        clearTimeout(this.alertTimeout)
        this.alertTimeout = setTimeout(() => {
          this.alert.show = false
        }, 5000)
      }
    }
  }
</script>

<style lang="scss" scoped>
.cms-config {
  padding: var(--cms-space-6);
  max-width: var(--cms-content-max);
  margin: 0 auto;
  .v-card {
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-lg);
    .v-card-title {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--cms-space-2);
      padding: var(--cms-space-5) var(--cms-space-6) var(--cms-space-2);
      .text-h5 {
        font-size: var(--cms-fs-xl);
        font-weight: var(--cms-fw-semibold);
      }
    }
    .v-card-text {
      padding: var(--cms-space-4) var(--cms-space-6) var(--cms-space-6);
      .mb-4 {
        margin-bottom: var(--cms-space-4);
      }
      .d-flex {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cms-space-2);
        justify-content: flex-end;
        .mr-2 {
          margin-right: 0;
        }
      }
      .my-4 {
        margin-top: var(--cms-space-4);
        margin-bottom: var(--cms-space-4);
      }
      .mt-4 {
        margin-top: var(--cms-space-4);
      }
      .text-caption {
        font-size: var(--cms-fs-sm);
        color: var(--cms-text-muted);
        opacity: 1;
      }
      .text-subtitle-1 {
        font-size: var(--cms-fs-md);
        font-weight: var(--cms-fw-semibold);
      }
    }
    .v-textarea {
      font-family: var(--cms-font-mono);
      :deep(.v-field__input) {
        font-family: var(--cms-font-mono);
        font-size: var(--cms-fs-sm);
      }
    }
  }
}

@media (max-width: 599.98px) {
  .cms-config {
    padding: var(--cms-space-3);
    .v-card .v-card-text,
    .v-card .v-card-title {
      padding-left: var(--cms-space-4);
      padding-right: var(--cms-space-4);
    }
  }
}
</style>
