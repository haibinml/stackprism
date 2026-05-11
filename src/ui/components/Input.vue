<template>
  <span class="sp-input" :class="{ disabled, focused, clearable: showClearButton }">
    <input
      ref="inputRef"
      class="sp-input-inner"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :spellcheck="spellcheck"
      :name="name"
      :autocomplete="autocomplete"
      @input="onInput"
      @keydown="emit('keydown', $event)"
      @focus="onFocus"
      @blur="onBlur"
    />
    <button
      v-if="showClearButton"
      type="button"
      class="sp-input-clear"
      tabindex="-1"
      :title="clearTitle"
      :aria-label="clearTitle"
      @mousedown.prevent="clear"
    >
      <X :size="12" :stroke-width="2" />
    </button>
  </span>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { X } from 'lucide-vue-next'

  const props = withDefaults(
    defineProps<{
      modelValue: string
      type?: string
      placeholder?: string
      disabled?: boolean
      clearable?: boolean
      spellcheck?: boolean
      clearTitle?: string
      name?: string
      autocomplete?: string
    }>(),
    {
      type: 'text',
      clearable: true,
      spellcheck: true,
      clearTitle: '清除'
    }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: string]
    keydown: [event: KeyboardEvent]
    focus: [event: FocusEvent]
    blur: [event: FocusEvent]
  }>()

  const inputRef = ref<HTMLInputElement | null>(null)
  const focused = ref(false)

  const showClearButton = computed(() => props.clearable && !props.disabled && Boolean(props.modelValue))

  const onInput = (event: Event) => {
    emit('update:modelValue', (event.target as HTMLInputElement).value)
  }

  const onFocus = (event: FocusEvent) => {
    focused.value = true
    emit('focus', event)
  }

  const onBlur = (event: FocusEvent) => {
    focused.value = false
    emit('blur', event)
  }

  const clear = () => {
    if (props.disabled) return
    emit('update:modelValue', '')
    inputRef.value?.focus()
  }
</script>

<style lang="scss" scoped>
  .sp-input {
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    display: inline-flex;
    font-size: 13px;
    gap: 4px;
    padding: 0 6px 0 10px;
    transition: border-color 0.15s ease;
    width: 100%;

    &:hover:not(.disabled) {
      border-color: var(--accent);
    }

    &.focused {
      border-color: var(--accent);
      outline: none;
    }

    &.disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .sp-input-inner {
    background: transparent;
    border: 0;
    color: var(--text);
    flex: 1 1 auto;
    font: inherit;
    min-width: 0;
    outline: none;
    padding: 7px 0;

    &::placeholder {
      color: var(--muted);
    }

    &::-webkit-search-cancel-button,
    &::-webkit-search-decoration {
      display: none;
      -webkit-appearance: none;
    }
  }

  .sp-input-clear {
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

    &:hover {
      background: var(--accent-soft);
      color: var(--accent);
    }
  }
</style>
