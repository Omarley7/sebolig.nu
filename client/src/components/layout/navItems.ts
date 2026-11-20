import { CalendarDays, House, Inbox, List } from "lucide-vue-next";

/** The four sections, in the bottom nav on phones and the left rail on desktop. */
export const NAV_ITEMS = [
  { name: "home", to: "/", icon: House, labelKey: "nav.home" },
  { name: "appointments", to: "/appointments", icon: CalendarDays, labelKey: "nav.appointments" },
  { name: "offers", to: "/offers", icon: Inbox, labelKey: "nav.offers" },
  { name: "waiting-lists", to: "/waiting-lists", icon: List, labelKey: "nav.waitingLists" },
] as const;
