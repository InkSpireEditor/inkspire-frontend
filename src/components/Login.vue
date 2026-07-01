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
  padding: 2rem;
  border-radius: 8px;
  box-shadow: var(--shadow-card);
  width: 100%;
  max-width: 400px;
}

h2 {
  text-align: center;
  margin-bottom: 1.5rem;
  color: var(--color-heading);
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--color-text);
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 1rem;
}

input:focus {
  outline: none;
  border-color: var(--color-primary);
}

button {
  width: 100%;
  padding: 0.75rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s;
  margin-top: 1rem;
}

button:hover {
  background-color: var(--color-primary-hover);
}

button:disabled {
  background-color: var(--color-border);
  cursor: not-allowed;
}

.error-message {
  color: var(--color-danger);
  margin-bottom: 1rem;
  font-size: 0.9rem;
  text-align: center;
}
</style>
