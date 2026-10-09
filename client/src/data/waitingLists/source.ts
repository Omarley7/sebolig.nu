import type { WaitingList, WaitingListSnapshot } from "@/types";

/** Where waiting lists come from: findbolig.nu through our backend, or the Demo. */
export interface WaitingListsSource {
  fetchAll(): Promise<WaitingList[]>;
  setActive(propertyId: string): Promise<void>;
  unsubscribe(propertyId: string): Promise<void>;
  /**
   * What the lists looked like before the first refresh ever. Only the Demo has one, so a
   * Demo user gets to see the went-passive banner; otherwise a first refresh flags nothing.
   */
  statusesBeforeFirstRefresh?(): WaitingListSnapshot[];
}
