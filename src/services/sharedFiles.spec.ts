import { describe, it, expect } from 'vitest'
import { useSharedFiles } from './sharedFiles'

describe('useSharedFiles', () => {
  it('initializes with nothing selected', () => {
    const { selectedFile, selectedFileId } = useSharedFiles()
    expect(selectedFile.value).toBeNull()
    expect(selectedFileId.value).toBeNull()
  })

  it('records the space a file was selected in, not only its id', () => {
    const { selectedFile, selectedFileId, setSelectedFile, clearSelectedFile } = useSharedFiles()

    setSelectedFile('notes', '123abcdef0123456')
    expect(selectedFile.value).toEqual({ space: 'notes', id: '123abcdef0123456' })
    expect(selectedFileId.value).toBe('123abcdef0123456')

    setSelectedFile('stories', 'fedcba9876543210')
    expect(selectedFile.value).toEqual({ space: 'stories', id: 'fedcba9876543210' })

    clearSelectedFile()
    expect(selectedFile.value).toBeNull()
    expect(selectedFileId.value).toBeNull()
  })
})
