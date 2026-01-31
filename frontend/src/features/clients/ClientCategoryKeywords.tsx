/**
 * Client Category Keywords Editor
 * Tag-input component for managing category keywords on a client.
 * Keywords are used to filter products by category name matching.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { X, Plus, Tag } from 'lucide-react'

interface ClientCategoryKeywordsProps {
  clientId: string
  clientName: string
  keywords: string[] | null
}

export default function ClientCategoryKeywords({ clientId, clientName, keywords }: ClientCategoryKeywordsProps) {
  const [newKeyword, setNewKeyword] = useState('')
  const [localKeywords, setLocalKeywords] = useState<string[]>(keywords || [])
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (updatedKeywords: string[]) =>
      apiClient.put(`/clients/${clientId}/category-keywords`, {
        keywords: updatedKeywords,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })

  const addKeyword = () => {
    const trimmed = newKeyword.trim()
    if (!trimmed || localKeywords.includes(trimmed)) return

    const updated = [...localKeywords, trimmed]
    setLocalKeywords(updated)
    setNewKeyword('')
    mutation.mutate(updated)
  }

  const removeKeyword = (keyword: string) => {
    const updated = localKeywords.filter(k => k !== keyword)
    setLocalKeywords(updated)
    mutation.mutate(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addKeyword()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Category Keywords for {clientName}
        </span>
      </div>

      {/* Current keywords */}
      <div className="flex flex-wrap gap-2">
        {localKeywords.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No keywords set. This client uses location-based filtering.
          </p>
        )}
        {localKeywords.map(keyword => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-violet-50 text-violet-700 border border-violet-200"
          >
            {keyword}
            <button
              onClick={() => removeKeyword(keyword)}
              className="hover:bg-violet-200 rounded-full p-0.5 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Add keyword input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newKeyword}
          onChange={e => setNewKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add keyword (e.g. Warner Music)"
          className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground flex-1 max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={addKeyword}
          disabled={!newKeyword.trim() || mutation.isPending}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>

      {mutation.isPending && (
        <p className="text-xs text-muted-foreground">Saving...</p>
      )}
      {mutation.isSuccess && (
        <p className="text-xs text-emerald-600">
          Keywords updated. {(mutation.data as any)?.products_matched ?? 0} products matched.
        </p>
      )}
      {mutation.isError && (
        <p className="text-xs text-red-600">Failed to update keywords.</p>
      )}
    </div>
  )
}
