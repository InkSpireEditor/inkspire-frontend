<script setup lang="ts">
import { ref } from 'vue'

const email = ref('')
const password = ref('')
const error = ref('')
const isLoading = ref(false)

// Placeholder for the API URL
const API_URL = 'http://localhost:8000/auth' 

const emit = defineEmits<{
  (e: 'login-success', token: string): void
}>()

const handleLogin = async () => {
  error.value = ''
  isLoading.value = true

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: email.value,
        password: password.value,
      }),
    })

    if (!response.ok) {
      throw new Error('Login failed. Please check your credentials.')
    }

    const data = await response.json()
    // Assuming the API returns a token in the 'token' field
    // Adjust this according to your actual API response structure
    const token = data.token 
    
    if (token) {
        emit('login-success', token)
    } else {
        throw new Error('No token received from server.')
    }

  } catch (e: any) {
    error.value = e.message || 'An error occurred during login.'
    // For prototype purposes, if the API fails (which it will with the placeholder), 
    // we might want to simulate success for specific credentials if requested, 
    // but strict adherence to instructions says "forward to REST API".
    // I will leave it as a real failure to encourage setting the real URL.
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
