<template>
  <div ref="selectRef" class="sp-select" :class="{ open: isOpen, disabled, creatable }">
    <button
      v-if="!creatable"
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
      <span
        v-if="showClearButton"
        class="sp-clear-btn"
        role="button"
        :title="clearTitle"
        :aria-label="clearTitle"
        @click.stop="clear"
        @mousedown.stop
      >
        <X :size="12" :stroke-width="2" />
      </span>
      <ChevronDown class="sp-select-chevron" :class="{ flipped: isOpen }" :size="14" :stroke-width="2" />
    </button>

    <div v-else class="sp-select-trigger sp-select-input-wrap" :class="{ disabled }">
      <input
        ref="inputRef"
        type="text"
        class="sp-select-input"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="onInput"
        @focus="open"
        @keydown="onKeyDown"
      />
      <button
        v-if="showClearButton"
        type="button"
        class="sp-clear-btn-input"
        tabindex="-1"
        :title="clearTitle"
        :aria-label="clearTitle"
        @mousedown.prevent="clear"
      >
        <X :size="12" :stroke-width="2" />
      </button>
      <button type="button" class="sp-chevron-btn" tabindex="-1" :disabled="disabled" @mousedown.prevent="toggleFromInput">
        <ChevronDown class="sp-select-chevron" :class="{ flipped: isOpen }" :size="14" :stroke-width="2" />
      </button>
    </div>

    <transition name="sp-fade">
      <ul v-if="isOpen && filteredOptions.length" ref="listRef" class="sp-select-list" role="listbox">
        <li
          v-for="(opt, i) in filteredOptions"
          :key="opt.value"
          :class="['sp-select-option', { selected: opt.value === modelValue, focused: i === focusIndex }]"
          role="option"
          :aria-selected="opt.value === modelValue"
          @mousedown.prevent="selectOption(opt.value)"
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
  import { Check, ChevronDown, X } from 'lucide-vue-next'

  interface SelectOption {
    value: string
    label: string
  }

  const props = withDefaults(
    defineProps<{
      modelValue: string
      options: SelectOption[]
      placeholder?: string
      disabled?: boolean
      creatable?: boolean
      clearable?: boolean
      clearTitle?: string
    }>(),
    {
      clearable: true,
      clearTitle: '清除选择'
    }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: string]
  }>()

  const isOpen = ref(false)
  const focusIndex = ref(-1)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const inputRef = ref<HTMLInputElement | null>(null)
  const listRef = ref<HTMLUListElement | null>(null)
  const selectRef = ref<HTMLDivElement | null>(null)

  const selectedLabel = computed(() => {
    const matched = props.options.find(o => o.value === props.modelValue)
    if (matched) return matched.label
    return props.modelValue || ''
  })

  const showClearButton = computed(() => props.clearable && !props.disabled && Boolean(props.modelValue))

  const clear = () => {
    if (props.disabled) return
    emit('update:modelValue', '')
    close()
    if (props.creatable) inputRef.value?.focus()
    else triggerRef.value?.focus()
  }

  const filteredOptions = computed(() => {
    if (!props.creatable) return props.options
    const query = props.modelValue.trim().toLowerCase()
    if (!query) return props.options
    const exact = props.options.find(o => o.value === props.modelValue)
    if (exact) return props.options
    return props.options.filter(o => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query))
  })

  const open = () => {
    if (props.disabled) return
    isOpen.value = true
    const idx = filteredOptions.value.findIndex(o => o.value === props.modelValue)
    focusIndex.value = idx >= 0 ? idx : 0
  }

  const close = () => {
    isOpen.value = false
  }

  const toggle = () => {
    if (isOpen.value) close()
    else open()
  }

  const toggleFromInput = () => {
    if (isOpen.value) {
      close()
    } else {
      inputRef.value?.focus()
      open()
    }
  }

  const selectOption = (value: string) => {
    emit('update:modelValue', value)
    close()
    if (props.creatable) inputRef.value?.focus()
    else triggerRef.value?.focus()
  }

  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    emit('update:modelValue', target.value)
    if (!isOpen.value) open()
    else focusIndex.value = 0
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (props.disabled) return
    if (!isOpen.value) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (!props.creatable && (e.key === 'Enter' || e.key === ' '))) {
        e.preventDefault()
        open()
      }
      return
    }

    const list = filteredOptions.value
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (list.length) focusIndex.value = (focusIndex.value + 1) % list.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (list.length) focusIndex.value = (focusIndex.value - 1 + list.length) % list.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusIndex.value = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      focusIndex.value = Math.max(0, list.length - 1)
    } else if (e.key === 'Enter') {
      const opt = list[focusIndex.value]
      if (opt) {
        e.preventDefault()
        selectOption(opt.value)
      } else if (props.creatable) {
        close()
      } else {
        e.preventDefault()
      }
    } else if (e.key === ' ' && !props.creatable) {
      e.preventDefault()
      const opt = list[focusIndex.value]
      if (opt) selectOption(opt.value)
    } else if (e.key === 'Tab') {
      close()
    }
  }

  const onClickOutside = (e: MouseEvent) => {
    if (!isOpen.value) return
    const target = e.target as Node
    if (selectRef.value?.contains(target)) return
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

  .sp-select-trigger:hover:not(:disabled):not(.disabled),
  .sp-select.open .sp-select-trigger,
  .sp-select-trigger:focus-visible,
  .sp-select-trigger:focus-within {
    border-color: var(--accent);
    outline: none;
  }

  .sp-select-trigger:disabled,
  .sp-select-trigger.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .sp-select-input-wrap {
    padding: 0 4px 0 0;
  }

  .sp-select-input {
    background: transparent;
    border: 0;
    color: var(--text);
    flex: 1;
    font: inherit;
    font-size: 13px;
    min-width: 0;
    outline: none;
    padding: 7px 0 7px 10px;
  }

  .sp-select-input::placeholder {
    color: var(--muted);
  }

  .sp-chevron-btn {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    height: 24px;
    justify-content: center;
    padding: 0;
    width: 24px;
  }

  .sp-chevron-btn:disabled {
    cursor: not-allowed;
  }

  .sp-clear-btn,
  .sp-clear-btn-input {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    flex-shrink: 0;
    height: 18px;
    justify-content: center;
    padding: 0;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    width: 18px;
  }

  .sp-clear-btn:hover,
  .sp-clear-btn-input:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .sp-select-value {
    flex: 1 1 auto;
    min-width: 0;
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
  .sp-select-trigger:hover:not(:disabled):not(.disabled) .sp-select-chevron {
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
