<script setup lang="ts">
import { Image as ImageIcon } from "lucide-vue-next";
import { computed, ref } from "vue";
import { compactThumb } from "~/lib/imageTransform";
import { imageUrl } from "~/lib/imageUrl";

/** A row's photo (Q5): a rounded square, an image placeholder until it loads, or when there is none. */
const props = withDefaults(defineProps<{ src?: string | null; size?: number }>(), { size: 56 });
const failed = ref(false);
const url = computed(() => (props.src && !failed.value ? compactThumb(imageUrl(props.src)) : undefined));
</script>

<template>
  <span
    class="relative shrink-0 rounded-xl overflow-hidden bg-soft text-soft-ink flex items-center justify-center"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <ImageIcon class="size-5" aria-hidden="true" />
    <img v-if="url" :src="url" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" @error="failed = true" />
  </span>
</template>
