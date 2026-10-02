<template>
  <v-app :class="{'unclickable': isLoading}">
    <v-theme-provider :theme="loginTheme">
      <div v-if="loaded" class="cms-layout login-layout" :class="{displayed: showLoginForm}">
        <main class="login-canvas">
          <div class="login-brand"><brand-logo /></div>
          <form novalidate @submit.prevent="login">
            <h1 class="embed-cms-title">
              {{ $filters.translate('TL_LOGIN') }}
            </h1>
            <div class="login-field">
              <label for="cms-login-username">{{ $filters.translate('TL_USERNAME') }}</label>
              <input
                id="cms-login-username" ref="username" v-model="username" autofocus type="text" name="embedCmsUsername" autocomplete="username"
                autocapitalize="none" spellcheck="false" :aria-invalid="loginFailed ? 'true' : 'false'" :aria-describedby="loginFailed ? 'cms-login-error' : undefined"
              >
            </div>
            <div class="login-field">
              <label for="cms-login-password">{{ $filters.translate('TL_PASSWORD') }}</label>
              <input
                id="cms-login-password" ref="password" v-model="password" type="password" name="embedCmsPassword" autocomplete="current-password"
                :aria-invalid="loginFailed ? 'true' : 'false'" :aria-describedby="loginFailed ? 'cms-login-error' : undefined"
              >
            </div>
            <p v-if="loginFailed" id="cms-login-error" class="error-message" role="alert">{{ $filters.translate('TL_LOGIN_FAIL') }}</p>
            <div class="login-btn-wrapper" :class="{disabled: !username || !password || loggingIn}">
              <button type="submit" :disabled="loggingIn" :aria-disabled="!username || !password || loggingIn ? 'true' : 'false'">
                {{ $filters.translate('TL_CONFIRM') }}
              </button>
            </div>
          </form>
        </main>
      </div>
      <loading v-if="isLoading" />
    </v-theme-provider>
  </v-app>
</template>

<script>
  import _ from 'lodash'

  import Loading from '@c/feedback/Loading.vue'
  import BrandLogo from '@c/layout/BrandLogo.vue'
  import { applyThemeToDocument, pickTheme } from '@u/theme'
  import LoadingService from '@s/LoadingService'
  import ConfigService from '@s/ConfigService'
  import TranslateService from '@s/TranslateService'
  import LoginService from '@s/LoginService'
  import RequestService from '@s/RequestService'

  export default {
    components: {
      Loading,
      BrandLogo
    },
    data () {
      return {
        username: null,
        password: null,
        activeField: false,
        loginFailed: false,
        isLoading: false,
        loggingIn: false,
        showLoginForm: false,
        loginTheme: 'light',
        loaded: false,
        LoadingService,
        TranslateService
      }
    },
    async unmounted () {
      LoadingService.events.off('has-loading', this.onLoading)
    },
    async mounted () {
      LoadingService.events.on('has-loading', this.onLoading)
      // light until the configuration says whether dark mode is allowed, so the page does not flash dark then light
      this.applyLoginTheme()
      this.$loading.start('init')
      try {
        const noLogin = _.get(window, 'noLogin', false)
        if (!noLogin) {
          LoginService.init()
        }
        await ConfigService.init()
        this.applyLoginTheme()
        await TranslateService.init()
        this.loaded = true
      } catch (error) {
        console.error('Error happen during mounted:', error)
      }
      this.loaded = true
      this.$nextTick(() => {
        setTimeout(() => {
          this.showLoginForm = true
        }, 100)
      })
      this.$loading.stop('init')
    },
    methods: {
      // the system preference, unless dark mode is turned off (as the admin itself does)
      applyLoginTheme () {
        const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        this.loginTheme = applyThemeToDocument(pickTheme(ConfigService.config, prefersDark ? 'dark' : 'light'))
        if (_.isFunction(_.get(this.$vuetify, 'theme.change'))) {
          this.$vuetify.theme.change(this.loginTheme)
        }
      },
      async onLoading(isLoading) {
        await this.$nextTick()
        this.isLoading = isLoading
        this.$forceUpdate()
      },
      async login () {
        if (this.loggingIn) {
          return
        } else if (!this.username) {
          return this.$refs.username.focus()
        } else if (!this.password) {
          return this.$refs.password.focus()
        }
        this.$loading.start('login')
        this.loggingIn = true
        try {
          await RequestService.post(`${window.location.pathname}login`, {username: this.username, password: this.password})
          this.$loading.stop('login')
          window.location.reload()
        } catch (error) {
          console.error('Error happen during login:', error)
          this.loginFailed = true
          this.$loading.stop('login')
        }
        this.loggingIn = false
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/mixins.scss' as *;

.login-layout {
  align-items: center;
  justify-content: center;
  padding: var(--cms-space-4);
  // a soft glow of the accent colour behind the card, fading into the page
  background:
    radial-gradient(900px 480px at 50% 18%, var(--cms-primary-soft), transparent 70%),
    var(--cms-bg);
  color: var(--cms-text);
  opacity: 0;
  transition: opacity var(--cms-motion-base) var(--cms-ease);
  overflow: auto;
  &.displayed {
    opacity: 1;
  }
}
.login-canvas {
  width: 100%;
  max-width: 420px;
  padding: var(--cms-space-8) var(--cms-space-8) var(--cms-space-8);
  background: var(--cms-surface);
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  box-shadow: var(--cms-shadow-3);
  position: relative;
  overflow: hidden;
  transform: translateY(8px);
  transition: transform var(--cms-motion-base) var(--cms-ease);
}
.login-canvas::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: linear-gradient(90deg, var(--cms-primary), var(--cms-primary-hover) 60%, var(--cms-primary-soft));
}
.displayed .login-canvas {
  transform: none;
}
.login-brand {
  display: flex;
  justify-content: center;
  margin-bottom: var(--cms-space-5);
  transform: scale(1.25);
  transform-origin: center;
}
.embed-cms-title {
  margin: 0 0 var(--cms-space-5);
  font-size: var(--cms-fs-xl);
  line-height: var(--cms-lh-tight);
  font-weight: var(--cms-fw-semibold);
  text-align: center;
  text-transform: none;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-1);
  margin-bottom: var(--cms-space-4);
  label {
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
    color: var(--cms-text);
  }
}
input {
  width: 100%;
  height: 44px;
  padding: 0 var(--cms-space-3);
  font: inherit;
  font-size: var(--cms-fs-md);
  color: var(--cms-text);
  background: var(--cms-surface);
  border: 1px solid var(--cms-border-strong);
  border-radius: var(--cms-radius-md);
  transition: border-color var(--cms-motion-fast) var(--cms-ease), box-shadow var(--cms-motion-fast) var(--cms-ease);
  &:hover {
    border-color: var(--cms-text-muted);
  }
  &:focus-visible {
    outline: none;
    border-color: var(--cms-primary);
    box-shadow: 0 0 0 3px var(--cms-primary-soft), 0 0 0 1px var(--cms-primary);
  }
  &[aria-invalid='true'] {
    border-color: var(--cms-error);
  }
}
.error-message {
  margin: 0 0 var(--cms-space-4);
  padding: var(--cms-space-2) var(--cms-space-3);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-error-soft);
  color: var(--cms-error);
  font-size: var(--cms-fs-sm);
  font-weight: var(--cms-fw-medium);
}
.login-btn-wrapper {
  width: 100%;
  button {
    width: 100%;
    height: 44px;
    border: 0;
    border-radius: var(--cms-radius-md);
    background: var(--cms-primary);
    color: var(--cms-on-primary);
    font: inherit;
    font-size: var(--cms-fs-md);
    font-weight: var(--cms-fw-semibold);
    cursor: pointer;
    transition: background-color var(--cms-motion-fast) var(--cms-ease);
    &:hover:not(:disabled) {
      background: var(--cms-primary-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--cms-focus-ring);
      outline-offset: 2px;
    }
    &:disabled {
      cursor: progress;
      opacity: 0.7;
    }
  }
  &.disabled button:not(:disabled) {
    background: var(--cms-surface-3);
    color: var(--cms-text-muted);
    cursor: pointer;
  }
}
</style>
