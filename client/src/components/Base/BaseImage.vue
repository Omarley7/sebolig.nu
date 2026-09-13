<script setup lang="ts">
/**
 * Image with a progressive reveal.
 *
 * Never requests a placeholder. `placeholder` is meant to be a URL the browser
 * has *already* fetched for a smaller rendition of the same source image (e.g.
 * the compact card thumb) — it is upscaled and CSS-blurred, so it costs no
 * network round-trip. Without one, a shimmer fills the gap instead.
 */
import { ref } from "vue";

const props = defineProps<{
  src: string;
  alt?: string;
  /** Already-cached smaller rendition of the same image. No new request is made. */
  placeholder?: string;
  eager?: boolean;
  imgClass?: string;
}>();

const loaded = ref(false);
const failed = ref(false);
</script>

<template>
  <div class="relative overflow-hidden bg-neutral-200 dark:bg-white/10">
    <!-- Cached low-res rendition, blurred. Absent → shimmer. -->
    <img
      v-if="props.placeholder && !loaded"
      :src="props.placeholder"
      alt=""
      aria-hidden="true"
      class="absolute inset-0 w-full h-full object-cover scale-110 blur-lg"
    />
    <div
      v-else-if="!loaded && !failed"
      class="absolute inset-0 animate-pulse bg-neutral-200 dark:bg-white/10"
    />

    <img
      :src="props.src"
      :alt="props.alt ?? ''"
      :loading="props.eager ? 'eager' : 'lazy'"
      class="relative w-full h-full object-cover transition-opacity duration-500"
      :class="[props.imgClass, loaded ? 'opacity-100' : 'opacity-0']"
      @load="loaded = true"
      @error="failed = true"
    />
  </div>
</template>
