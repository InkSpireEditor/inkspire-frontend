import { describe, it, expect } from 'vitest'
import { useSharedFiles } from './sharedFiles'

describe('useSharedFiles', () => {
  it('initializes with null selectedFileId', () => {
    const { selectedFileId } = useSharedFiles()
    expect(selectedFileId.value).toBeNull()
  })

  it('updates selectedFileId when setSelectedFile is called', () => {
    const { selectedFileId, setSelectedFile } = useSharedFiles()
    setSelectedFile(123)
    expect(selectedFileId.value).toBe(123)
    
    setSelectedFile(null)
    expect(selectedFileId.value).toBeNull()
  })
})
