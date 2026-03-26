import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useChunks, useDeleteDocument, useDocument, useDocuments, useIngestDocument } from './useDocuments'

vi.mock('@/api/embeddings', () => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  ingestDocument: vi.fn(),
  deleteDocument: vi.fn(),
  listChunks: vi.fn(),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useDocuments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes data from listDocuments', async () => {
    const { listDocuments } = await import('@/api/embeddings')
    const mockDocs = [{ id: '1', title: 'Doc A', chunk_count: 3 }]
    vi.mocked(listDocuments).mockResolvedValue(mockDocs as never)

    const { result } = renderHook(() => useDocuments(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockDocs)
  })
})

describe('useDocument', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is disabled when id is empty', () => {
    const { result } = renderHook(() => useDocument(''), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches a single document by id', async () => {
    const { getDocument } = await import('@/api/embeddings')
    const mockDoc = { id: 'abc', title: 'Doc B', content: 'text', chunk_count: 2 }
    vi.mocked(getDocument).mockResolvedValue(mockDoc as never)

    const { result } = renderHook(() => useDocument('abc'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockDoc)
  })
})

describe('useIngestDocument', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes a mutate function', () => {
    const { result } = renderHook(() => useIngestDocument(), { wrapper })
    expect(typeof result.current.mutate).toBe('function')
  })
})

describe('useDeleteDocument', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes a mutate function', () => {
    const { result } = renderHook(() => useDeleteDocument(), { wrapper })
    expect(typeof result.current.mutate).toBe('function')
  })
})

describe('useChunks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is idle when documentId is undefined', () => {
    const { result } = renderHook(() => useChunks(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('queries when documentId is set and returns chunk array', async () => {
    const { listChunks } = await import('@/api/embeddings')
    const mockChunks = [
      { id: 'c1', document: 'd1', document_title: 'Doc', content: 'hello', chunk_index: 0, created_at: '2026-01-01T00:00:00Z' },
    ]
    vi.mocked(listChunks).mockResolvedValue(mockChunks as never)

    const { result } = renderHook(() => useChunks('d1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockChunks)
    expect(vi.mocked(listChunks)).toHaveBeenCalledWith('d1')
  })

  it('surfaces error state when query fails', async () => {
    const { listChunks } = await import('@/api/embeddings')
    vi.mocked(listChunks).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useChunks('d2'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
