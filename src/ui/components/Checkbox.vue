<template>
  <span class="sp-checkbox" :class="{ checked: isChecked, disabled }">
    <input type="checkbox" class="sp-checkbox-input" :checked="isChecked" :disabled="disabled" @change="onChange" />
    <span class="sp-checkbox-box" aria-hidden="true">
      <svg
        class="sp-checkbox-mark"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = withDefaults(
    defineProps<{
      modelValue: boolean | unknown[]
      value?: unknown
      disabled?: boolean
    }>(),
    {
      disabled: false
    }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: boolean | unknown[]]
    change: [event: Event]
  }>()

  const isChecked = computed(() => {
    if (Array.isArray(props.modelValue)) {
      return props.value !== undefined && props.modelValue.includes(props.value)
    }
    return Boolean(props.modelValue)
  })

  const onChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (Array.isArray(props.modelValue)) {
      const next = [...props.modelValue]
      const idx = next.indexOf(props.value)
      if (target.checked && idx === -1) next.push(props.value)
      else if (!target.checked && idx !== -1) next.splice(idx, 1)
      emit('update:modelValue', next)
    } else {
      emit('update:modelValue', target.checked)
    }
    emit('change', event)
  }
</script>

<style scoped>
  .sp-checkbox {
    align-items: center;
    display: inline-flex;
    position: relative;
  }

  .sp-checkbox-input {
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    height: 14px;
    inset: 0;
    margin: 0;
    opacity: 0;
    position: absolute;
    width: 14px;
  }

  .sp-checkbox-input:disabled {
    cursor: not-allowed;
  }

  .sp-checkbox-box {
    align-items: center;
    background: var(--panel);
    border: 1.5px solid var(--line);
    border-radius: 3px;
    color: #ffffff;
    display: inline-flex;
    flex-shrink: 0;
    height: 14px;
    justify-content: center;
    pointer-events: none;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
    width: 14px;
  }

  .sp-checkbox:hover .sp-checkbox-box {
    border-color: var(--accent);
  }

  .sp-checkbox.checked .sp-checkbox-box {
    background: var(--accent);
    border-color: var(--accent);
  }

  .sp-checkbox.disabled {
    opacity: 0.5;
  }

  .sp-checkbox-mark {
    height: 10px;
    stroke-dasharray: 24;
    stroke-dashoffset: 24;
    transition: stroke-dashoffset 0.24s cubic-bezier(0.4, 0, 0.2, 1);
    width: 10px;
  }

  .sp-checkbox.checked .sp-checkbox-mark {
    stroke-dashoffset: 0;
  }

  .sp-checkbox-input:focus-visible + .sp-checkbox-box {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
