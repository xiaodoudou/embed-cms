import { createApp, watch } from 'vue'
import App from './App.vue'
import { createServices, SERVICES } from './services'
import { createAppRouter } from './router'
import './styles.css'

const services = createServices()
const router = createAppRouter(services)

// the websocket is open while somebody is signed in, and only then
watch(() => services.session.state.user, (user) => (user ? services.realtime.start() : services.realtime.stop()), { immediate: true })

createApp(App).provide(SERVICES, services).use(router).mount('#app')
