import posthog from "posthog-js";

const USER_ID_KEY = "sebolig_uid";

// Only the production site reports analytics. Dev, the test site and preview URLs stay silent.
const ANALYTICS_HOSTS = ["sebolig.nu"];

function analyticsEnabled(): boolean {
  return !import.meta.env.DEV && ANALYTICS_HOSTS.includes(location.hostname);
}

export function getOrCreateUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function usePostHog() {
  const enabled = analyticsEnabled();
  posthog.init("phc_hYEZSA6EvqCS9wjHxs1cydKoyj7znWPhESMvRPQWkda", {
    api_host: "https://eu.i.posthog.com",
    defaults: "2026-01-30",
    person_profiles: "always",
    opt_out_capturing_by_default: !enabled,
    // Replays show clicks and navigation, never what is on screen or typed.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
    loaded: function (ph) {
      if (!enabled) {
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
