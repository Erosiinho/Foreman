import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'dashboard',
            component: () => import('../views/DashboardView.vue'),
        },
        {
            path: '/:owner/:repo',
            name: 'project',
            component: () => import('../views/ProjectView.vue'),
            props: true,
        },
    ],
});

export default router;
