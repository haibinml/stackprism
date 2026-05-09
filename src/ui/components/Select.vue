<template>
  <div class="sp-select" :class="{ open: isOpen, disabled }">
    <button
      ref="triggerRef"
      type="button"
      class="sp-select-trigger"
      :disabled="disabled"
      :aria-haspopup="true"
      :aria-expanded="isOpen"
      @click="toggle"
      @keydown="onKeyDown"
    >
      <span :class="['sp-select-value', { placeholder: !selectedLabel }]">
        {{ selectedLabel || placeholder || '请选择' }}
      </span>
      <ChevronDown class="sp-select-chevron" :class="{ flipped: isOpen }" :size="14" :stroke-width="2" />
    </button>
    <transition name="sp-fade">
      <ul v-if="isOpen" ref="listRef" class="sp-select-list" role="listbox">
        <li
          v-for="(opt, i) in options"
          :key="opt.value"
          :class="['sp-select-option', { selected: opt.value === modelValue, focused: i === focusIndex }]"
          role="option"
          :aria-selected="opt.value === modelValue"
          @click="selectOption(opt.value)"
          @mouseenter="focusIndex = i"
        >
          <span>{{ opt.label }}</span>
          <Check v-if="opt.value === modelValue" :size="14" :stroke-width="2.2" />
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
  import { Check, ChevronDown } from 'lucide-vue-next'

  interface SelectOption {
    value: string
    label: string
  }

  const props = defineProps<{
    modelValue: string
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: string]
  }>()

  const isOpen = ref(false)
  const focusIndex = ref(-1)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const listRef = ref<HTMLUListElement | null>(null)

  const selectedLabel = computed(() => props.options.find(o => o.value === props.modelValue)?.label ?? '')

  const open = () => {
    if (props.disabled) return
    isOpen.value = true
    const idx = props.options.findIndex(o => o.value === props.modelValue)
    focusIndex.value = idx >= 0 ? idx : 0
  }

  const close = () => {
    isOpen.value = false
  }

  const toggle = () => {
    if (isOpen.value) close()
    else open()
  }

  const selectOption = (value: string) => {
    emit('update:modelValue', value)
    close()
    triggerRef.value?.focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (props.disabled) return
    if (!isOpen.value) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusIndex.value = (focusIndex.value + 1) % props.options.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusIndex.value = (focusIndex.value - 1 + props.options.length) % props.options.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusIndex.value = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      focusIndex.value = props.options.length - 1
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = props.options[focusIndex.value]
      if (opt) selectOption(opt.value)
    } else if (e.key === 'Tab') {
      close()
    }
  }

  const onClickOutside = (e: MouseEvent) => {
    if (!isOpen.value) return
    const target = e.target as Node
    if (triggerRef.value?.contains(target)) return
    if (listRef.value?.contains(target)) return
    close()
  }

  onMounted(() => {
    document.addEventListener('click', onClickOutside)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', onClickOutside)
  })
</script>

<style scoped>
  .sp-select {
    display: block;
    position: relative;
    width: 100%;
  }

  .sp-select-trigger {
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    display: flex;
    font: inherit;
    font-size: 13px;
    gap: 8px;
    justify-content: space-between;
    padding: 7px 10px;
    text-align: left;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
    width: 100%;
  }

  .sp-select-trigger:hover:not(:disabled),
  .sp-select.open .sp-select-trigger,
  .sp-select-trigger:focus-visible {
    border-color: var(--accent);
    outline: none;
  }

  .sp-select-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .sp-select-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sp-select-value.placeholder {
    color: var(--muted);
  }

  .sp-select-chevron {
    color: var(--muted);
    flex-shrink: 0;
    transition:
      color 0.15s ease,
      transform 0.2s ease;
  }

  .sp-select-chevron.flipped {
    transform: rotate(180deg);
  }

  .sp-select.open .sp-select-chevron,
  .sp-select-trigger:hover:not(:disabled) .sp-select-chevron {
    color: var(--accent);
  }

  .sp-select-list {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: var(--shadow);
    left: 0;
    list-style: none;
    margin: 4px 0 0;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 60;
  }

  .sp-select-option {
    align-items: center;
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    display: flex;
    font-size: 13px;
    gap: 8px;
    justify-content: space-between;
    padding: 6px 10px;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .sp-select-option.focused {
    background: var(--accent-soft);
  }

  .sp-select-option.selected {
    color: var(--accent);
    font-weight: 500;
  }

  .sp-fade-enter-from,
  .sp-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }

  .sp-fade-enter-active,
  .sp-fade-leave-active {
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }
</style>
