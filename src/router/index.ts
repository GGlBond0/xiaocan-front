import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/location',
      name: 'location',
      component: () => import('../views/LocationView.vue'),
    },
    {
      path: '/monitor',
      name: 'monitor',
      component: () => import('../views/MonitorConfigView.vue'),
    },
    {
      path: '/notify-history',
      name: 'notify-history',
      component: () => import('../views/NotifyHistoryView.vue'),
    },
  ],
})

export default router
