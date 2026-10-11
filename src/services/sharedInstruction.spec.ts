import { describe, it, expect } from 'vitest'
import { useSharedInstruction } from './sharedInstruction'

describe('useSharedInstruction', () => {
  it('starts out empty', () => {
    const { instruction } = useSharedInstruction()
    expect(instruction.value).toBe('')
  })

  it('setInstruction updates it, clearInstruction resets it', () => {
    const { instruction, setInstruction, clearInstruction } = useSharedInstruction()

    setInstruction('Make this more neutral.')
    expect(instruction.value).toBe('Make this more neutral.')

    clearInstruction()
    expect(instruction.value).toBe('')
  })
})
