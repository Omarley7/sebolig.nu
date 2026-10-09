/**
 * The composition root: connects the Local data module to the Connection and the router.
 * Call the install functions once pinia and the router are installed.
 */
import { localData } from "~/app/localData";
import { useAuth } from "~/composables/useAuth";
import router from "~/router";
// Every kind registers for erasing when it is defined, so all of them are imported here,
// at startup, not only when a page happens to use them.
import "~/stores/appointments";
import "~/stores/offers";
import "~/stores/waitingLists";

/** Connects the Local data module to the Connection; call once pinia is installed. */
export function installLocalData() {
  useAuth().onEraseLocalData(localData.eraseAll);
}

/** Pages showing Local data need a Connection (a Demo counts); without one, go home. */
export function installConnectionGuard() {
  router.beforeEach((to) => {
    if (to.meta.requiresConnection && !useAuth().isAuthenticated) return { name: "home" };
  });
}
