/**
 * The composition root: connects the Local data module to the Connection and the router.
 * Call the install functions once pinia and the router are installed.
 */
import { localData } from "~/app/localData";
import { useAuth } from "~/composables/useAuth";
import { checkAppointmentsOnAccept } from "~/localData/appointments";
import { trackChanges } from "~/localData/changes";
import router from "~/router";
// Every kind registers for erasing when it is defined, so all of them are imported here,
// at startup, not only when a page happens to use them.
import { useAppointmentsStore } from "~/stores/appointments";
import { useChangesStore } from "~/stores/changes";
import { useOffersStore } from "~/stores/offers";
import "~/stores/waitingLists";

/**
 * Connects the Local data module to the Connection, has what checks and refreshes change
 * recorded in the changes log, and has accepting an offer check appointments; call once pinia is
 * installed.
 */
export function installLocalData() {
  useAuth().onEraseLocalData(localData.eraseAll);
  const appointments = useAppointmentsStore();
  const offers = useOffersStore();
  trackChanges({ appointments, offers, changes: useChangesStore() });
  checkAppointmentsOnAccept({ appointments, offers });
}

/** Pages showing Local data need a Connection (a Demo counts); without one, go home. */
export function installConnectionGuard() {
  router.beforeEach((to) => {
    if (to.meta.requiresConnection && !useAuth().isAuthenticated) return { name: "home" };
  });
}
