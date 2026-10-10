<template>
  <li>
    <div class="flex gap-3 p-2 rounded-xl skeleton-card">
      <!-- Thumbnail skeleton -->
      <div class="w-24 md:w-32 shrink-0 aspect-[3/2] rounded-lg skeleton-bone" />

      <!-- Text skeleton -->
      <div class="flex flex-col justify-between flex-1 py-0.5">
        <div class="space-y-1.5">
          <div class="h-3.5 w-3/4 rounded skeleton-bone" />
          <div class="h-3 w-1/2 rounded skeleton-bone" />
        </div>
        <div class="space-y-1.5 mt-2">
          <div class="h-3 w-2/5 rounded skeleton-bone" />
          <div class="h-3.5 w-1/3 rounded skeleton-bone" />
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped>
.skeleton-card {
  background: rgb(163 163 163 / 0.06);
}

:where(.dark, .dark *) .skeleton-card {
  background: rgb(255 255 255 / 0.02);
}

.skeleton-bone {
  background: linear-gradient(
    90deg,
    rgb(163 163 163 / 0.12) 0%,
    rgb(163 163 163 / 0.22) 50%,
    rgb(163 163 163 / 0.12) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.8s ease-in-out infinite;
}

:where(.dark, .dark *) .skeleton-bone {
  background: linear-gradient(
    90deg,
    rgb(255 255 255 / 0.05) 0%,
    rgb(255 255 255 / 0.12) 50%,
    rgb(255 255 255 / 0.05) 100%
  );
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
