<script setup lang="ts">
import { ref } from 'vue'
import { AUTH_URL } from '../services/api'

const email = ref('')
const password = ref('')
const error = ref('')
const isLoading = ref(false)

const emit = defineEmits<{
  (e: 'login-success'): void
}>()

const handleLogin = async () => {
  error.value = ''
  isLoading.value = true

  try {
    // credentials: 'include' lets the browser store the httpOnly auth cookies
    // the backend sets on the response. The JWT is never read in JS.
    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        username: email.value,
        password: password.value,
      }),
    })

    if (!response.ok) {
      throw new Error('Login failed. Please check your credentials.')
    }

    emit('login-success')
  } catch (e: any) {
    error.value = e.message || 'An error occurred during login.'
    console.error(e)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h2>Login</h2>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            v-model="email"
            required
            placeholder="Enter your email"
          />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            v-model="password"
            required
            placeholder="Enter your password"
          />
        </div>
        <div v-if="error" class="error-message">
          {{ error }}
        </div>
        <button type="submit" :disabled="isLoading">
          {{ isLoading ? 'Logging in...' : 'Login' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  width: 100%;
}

.login-card {
  background: var(--color-background-soft);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  width: 100%;
  max-width: 400px;
}

h2 {
  text-align: center;
  margin-bottom: var(--space-5);
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
}

.form-group {
  margin-bottom: var(--space-4);
}

label {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
  transition: border-color var(--transition), box-shadow var(--transition);
}

input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

button {
  width: 100%;
  padding: 0.75rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background-color var(--transition), transform var(--transition), box-shadow var(--transition);
  margin-top: var(--space-4);
}

button:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
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
  background-color: var(--color-border);
  cursor: not-allowed;
}

.error-message {
  color: var(--color-danger);
  margin-bottom: var(--space-4);
  font-size: 0.9rem;
  text-align: center;
}
</style>
