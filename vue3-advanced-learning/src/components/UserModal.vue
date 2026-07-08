<script setup lang="ts">
/**
 * Modal — demonstrates Teleport + transition + slot pattern.
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';

interface Props {
  open: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), { title: '' });
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

function close(): void {
  emit('update:open', false);
}

function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) close();
}

onMounted(() => {
  window.addEventListener('keydown', onEsc);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEsc);
});

watch(
  () => props.open,
  (open) => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = open ? 'hidden' : '';
    }
  }
);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="modal-backdrop"
        @click.self="close"
      >
        <div
          class="modal-card"
          role="dialog"
          aria-modal="true"
        >
          <header class="modal-header">
            <h3>{{ title }}</h3>
            <button
              class="close-btn"
              aria-label="关闭"
              @click="close"
            >
              ×
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="modal-footer"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-card {
  background: #fff;
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);

  h3 { margin: 0; }
}

.close-btn {
  background: transparent;
  color: var(--color-text);
  font-size: 1.5rem;
  width: 32px;
  height: 32px;
  padding: 0;
  line-height: 1;
  border-radius: 50%;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--color-text);
  }
}

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  background: #fafbfc;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
