import posthog from "posthog-js";

const USER_ID_KEY = "sebolig_uid";

export function getOrCreateUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function usePostHog() {
  posthog.init("phc_hYEZSA6EvqCS9wjHxs1cydKoyj7znWPhESMvRPQWkda", {
    api_host: "https://eu.i.posthog.com",
    defaults: "2026-01-30",
    person_profiles: "always",
    // Replays show clicks and navigation, never what is on screen or typed.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
    loaded: function (ph) {
      if (import.meta.env.DEV) {
        ph.opt_out_capturing();
        ph.set_config({ disable_session_recording: true });
      }
    },
  });

  return { posthog };
}

/**
 * Links events to this device's random id. A connected user's email and name are never sent;
 * only demo mode passes the name the visitor typed for the demo.
 */
export function identify(properties?: { name?: string }) {
  posthog.identify(getOrCreateUserId(), properties);
}
