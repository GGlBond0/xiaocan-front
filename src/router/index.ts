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
    {
      path: '/grab-login',
      redirect: '/location',
    },
    {
      path: '/grab',
      name: 'grab',
      component: () => import('../views/GrabConfigView.vue'),
    },
    {
      path: '/grab-history',
      name: 'grab-history',
      component: () => import('../views/GrabHistoryView.vue'),
    },
    {
      path: '/grab-card',
      name: 'grab-card',
      component: () => import('../views/GrabCardView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
  ],
})

export default router
