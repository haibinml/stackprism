<template>
  <span class="sp-textarea" :class="{ disabled, focused, clearable: showClearButton }">
    <textarea
      ref="textareaRef"
      class="sp-textarea-inner"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows"
      :spellcheck="spellcheck"
      :name="name"
      @input="onInput"
      @keydown="emit('keydown', $event)"
      @focus="onFocus"
      @blur="onBlur"
    />
    <button
      v-if="showClearButton"
      type="button"
      class="sp-textarea-clear"
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
      placeholder?: string
      disabled?: boolean
      clearable?: boolean
      spellcheck?: boolean
      rows?: number | string
      clearTitle?: string
      name?: string
    }>(),
    {
      clearable: true,
      spellcheck: false,
      rows: 6,
      clearTitle: '清除'
    }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: string]
    keydown: [event: KeyboardEvent]
    focus: [event: FocusEvent]
    blur: [event: FocusEvent]
  }>()

  const textareaRef = ref<HTMLTextAreaElement | null>(null)
  const focused = ref(false)

  const showClearButton = computed(() => props.clearable && !props.disabled && Boolean(props.modelValue))

  const onInput = (event: Event) => {
    emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
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
    textareaRef.value?.focus()
  }
</script>

<style lang="scss" scoped>
  .sp-textarea {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    display: block;
    font-size: 12px;
    position: relative;
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

  .sp-textarea-inner {
    background: transparent;
    border: 0;
    color: var(--text);
    display: block;
    font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    font-size: 12px;
    line-height: 1.5;
    min-height: 60px;
    outline: none;
    padding: 7px 10px;
    resize: vertical;
    width: 100%;

    &::placeholder {
      color: var(--muted);
    }
  }

  .sp-textarea-clear {
    align-items: center;
    background: var(--panel);
    border: 0;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    height: 22px;
    justify-content: center;
    padding: 0;
    position: absolute;
    right: 6px;
    top: 6px;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    width: 22px;
    z-index: 1;

    &:hover {
      background: var(--accent-soft);
      color: var(--accent);
    }
  }
</style>
