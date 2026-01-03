import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Login from './Login.vue'

describe('Login.vue', () => {
  let fetchSpy = vi.spyOn(window, 'fetch')

  beforeEach(() => {
    fetchSpy = vi.spyOn(window, 'fetch')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders login form', () => {
    const wrapper = mount(Login)
    expect(wrapper.find('h2').text()).toBe('Login')
    expect(wrapper.find('#email').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
    expect(wrapper.find('button').text()).toBe('Login')
  })

  it('updates model values on input', async () => {
    const wrapper = mount(Login)
    const emailInput = wrapper.find('#email')
    const passwordInput = wrapper.find('#password')

    await emailInput.setValue('test@example.com')
    await passwordInput.setValue('password123')

    expect((emailInput.element as HTMLInputElement).value).toBe('test@example.com')
    expect((passwordInput.element as HTMLInputElement).value).toBe('password123')
  })

  it('emits login-success on successful login', async () => {
    const mockToken = 'fake-jwt-token'
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: mockToken }),
    } as Response)

    const wrapper = mount(Login)
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('#password').setValue('password123')
    await wrapper.find('form').trigger('submit')

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:8000/auth', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        username: 'test@example.com',
        password: 'password123',
      })
    }))

    // Wait for async login logic
    await vi.waitFor(() => {
      expect(wrapper.emitted()).toHaveProperty('login-success')
      expect(wrapper.emitted('login-success')![0]).toEqual([mockToken])
    })
  })

  it('displays error message on failed login', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
    } as Response)

    const wrapper = mount(Login)
    await wrapper.find('#email').setValue('wrong@example.com')
    await wrapper.find('#password').setValue('wrong')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.find('.error-message').exists()).toBe(true)
      expect(wrapper.find('.error-message').text()).toContain('Login failed')
    })
  })

  it('disables button and shows loading state during login', async () => {
    fetchSpy.mockReturnValue(new Promise(() => {})) // Promise that never resolves

    const wrapper = mount(Login)
    await wrapper.find('form').trigger('submit')

    const button = wrapper.find('button')
    expect(button.element.disabled).toBe(true)
    expect(button.text()).toBe('Logging in...')
  })
})
