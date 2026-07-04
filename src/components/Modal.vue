<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  loading?: boolean
  maxWidth?: string
}>()

const emit = defineEmits(['close', 'confirm'])

const handleCancel = () => {
  if (emit) emit('close')
}

const handleConfirm = () => {
  if (emit) emit('confirm')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="handleCancel">
      <div class="modal" :style="{ maxWidth: maxWidth || '400px' }">
        <h3>{{ title }}</h3>
        
        <div class="modal-body">
          <slot></slot>
        </div>

        <div class="modal-actions">
          <button @click="handleCancel" :disabled="loading">
            {{ cancelText || 'Cancel' }}
          </button>
          <button 
            :class="isDanger ? 'danger' : 'primary'" 
            @click="handleConfirm"
            :disabled="loading"
          >
            <span v-if="loading">...</span>
            <span v-else>{{ confirmText || 'Save' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-background);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: var(--shadow-strong);
  color: var(--color-text);
}

h3 {
  margin: 0;
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

button {
  padding: 8px 16px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
  transition: background-color var(--transition), border-color var(--transition),
    transform var(--transition), box-shadow var(--transition), filter var(--transition);
}

button:hover:not(:disabled) {
  background: var(--color-background-mute);
  transform: translateY(-1px);
}

button:active:not(:disabled) {
  transform: translateY(0);
}

button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.danger {
  background: var(--color-danger);
  color: white;
  border: none;
}

.danger:hover:not(:disabled) {
  filter: brightness(0.9);
}

/* Deep selector to style form elements passed via slot */
:deep(.form-group) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:deep(label) {
  font-size: 0.9rem;
  font-weight: var(--font-weight-medium);
}

:deep(input), :deep(textarea) {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-background-soft);
  color: var(--color-text);
  font-family: inherit;
  width: 100%;
  transition: border-color var(--transition), box-shadow var(--transition);
}

:deep(input:focus), :deep(textarea:focus) {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}
</style>