<template>
  <button ref="btnRef" :type="type" :disabled="disabled" class="sp-rb" :class="[`sp-rb--${variant}`]" @pointerdown="onPointerDown">
    <span class="sp-rb-content"><slot /></span>
    <span class="sp-rb-ripples" aria-hidden="true">
      <span
        v-for="r in ripples"
        :key="r.id"
        class="sp-rb-ripple"
        :style="{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.size}px`, height: `${r.size}px` }"
        @animationend="onRippleEnd(r.id)"
      />
    </span>
  </button>
</template>

<script setup lang="ts">
  import { ref } from 'vue'

  type Variant = 'default' | 'primary' | 'danger'

  const props = withDefaults(
    defineProps<{
      type?: 'button' | 'submit' | 'reset'
      disabled?: boolean
      variant?: Variant
    }>(),
    {
      type: 'button',
      disabled: false,
      variant: 'default'
    }
  )

  interface Ripple {
    id: number
    x: number
    y: number
    size: number
  }

  const ripples = ref<Ripple[]>([])
  const btnRef = ref<HTMLButtonElement | null>(null)
  let nextId = 0

  const onPointerDown = (e: PointerEvent) => {
    if (props.disabled) return
    const el = btnRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = Math.max(e.clientX - rect.left, rect.right - e.clientX)
    const dy = Math.max(e.clientY - rect.top, rect.bottom - e.clientY)
    const radius = Math.sqrt(dx * dx + dy * dy)
    const size = radius * 2
    ripples.value.push({
      id: nextId++,
      x: e.clientX - rect.left - radius,
      y: e.clientY - rect.top - radius,
      size
    })
  }

  const onRippleEnd = (id: number) => {
    ripples.value = ripples.value.filter(r => r.id !== id)
  }
</script>

<style scoped>
  .sp-rb {
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }

  .sp-rb-content {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sp-rb-ripples {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .sp-rb-ripple {
    position: absolute;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.18;
    transform: scale(0);
    animation: sp-rb-spread 420ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .sp-rb--primary .sp-rb-ripple {
    background: #ffffff;
    opacity: 0.28;
  }

  @keyframes sp-rb-spread {
    to {
      transform: scale(1);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sp-rb-ripple {
      animation-duration: 0ms;
    }
  }
</style>
