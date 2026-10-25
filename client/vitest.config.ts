import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// The users' time zone, so date tests see the same days and clock changes they do. Set here,
// before the test workers start, which take their time zone from this process.
process.env.TZ = "Europe/Copenhagen";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      include: ["src/**/*.test.ts"],
    },
  }),
);
