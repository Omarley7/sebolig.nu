import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { usePostHog } from "~/composables/usePostHog";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("~/views/HomeView.vue"),
  },
  {
    path: "/appointments",
    name: "appointments",
    meta: { requiresConnection: true },
    component: () => import("~/views/AppointmentsView.vue"),
  },
  {
    path: "/offers",
    name: "offers",
    meta: { requiresConnection: true },
    component: () => import("~/views/OffersView.vue"),
  },
  {
    path: "/waiting-lists",
    name: "waiting-lists",
    meta: { requiresConnection: true },
    component: () => import("~/views/WaitingListsView.vue"),
  },
  {
    path: "/saadan-virker-det",
    name: "explainer",
    component: () => import("~/views/ExplainerView.vue"),
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("~/views/NotFoundView.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

usePostHog();

export default router;
