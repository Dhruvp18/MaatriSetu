'use client'

import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'

/**
 * A list of short entries typed with search-box completion.
 *
 * Type "c" and the best completions drop down, most common first; arrow keys
 * move, Enter or Tab takes the highlighted one, and Enter on a line with no
 * highlight adds exactly what was typed — an unlisted test is still a valid
 * order. Backspace on an empty line removes the last entry.
 *
 * Suggestions complete spelling. They are never a recommendation of what to
 * order (PRD §3).
 */

export interface Suggestion {
  readonly value: string
  readonly detail?: string
}

export function TokenInput({
  id,
  label,
  values,
  onChange,
  search,
  quickPicks = [],
  placeholder,
}: {
  id: string
  label: string
  values: readonly string[]
  onChange: (values: string[]) => void
  search: (query: string, exclude: readonly string[]) => readonly Suggestion[]
  quickPicks?: readonly string[]
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const listId = useId()

  const suggestions = focused ? search(query, values) : []
  const showList = suggestions.length > 0

  const add = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (!values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...values, trimmed])
    }
    setQuery('')
    setActive(0)
  }

  const remove = (index: number) => onChange(values.filter((_, i) => i !== index))

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && showList) {
      event.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && showList) {
      event.preventDefault()
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter' || (event.key === 'Tab' && showList && query)) {
      // Enter must never submit the consultation from inside this field.
      event.preventDefault()
      const picked = showList ? suggestions[active] : undefined
      add(picked ? picked.value : query)
    } else if (event.key === ',') {
      event.preventDefault()
      add(query)
    } else if (event.key === 'Backspace' && !query && values.length > 0) {
      remove(values.length - 1)
    } else if (event.key === 'Escape') {
      setQuery('')
    }
  }

  const unusedPicks = quickPicks.filter(
    (pick) => !values.some((v) => v.toLowerCase() === pick.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-medium text-slate-600">
        {label}
      </label>

      <div className="relative">
        <div className="flex min-h-8 flex-wrap items-center gap-1 rounded border border-slate-300 bg-white/80 px-1.5 py-1 focus-within:border-brand-600 focus-within:ring-1 focus-within:ring-brand-600">
          {values.map((value, index) => (
            <span
              key={value}
              className="flex items-center gap-1 rounded bg-brand-50 py-0.5 pr-0.5 pl-1.5 text-[11px] font-semibold text-brand-800"
            >
              {value}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove ${value}`}
                className="rounded p-0.5 text-brand-600 hover:bg-brand-100"
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            id={id}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            // Delayed so a click on a suggestion lands before the list closes.
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            placeholder={values.length === 0 ? placeholder : ''}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-xs text-slate-900 outline-none"
          />
        </div>

        {showList ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.value} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(suggestion.value)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full items-baseline justify-between gap-3 px-2.5 py-1.5 text-left text-xs ${
                    index === active ? 'bg-brand-50 text-brand-800' : 'text-slate-800'
                  }`}
                >
                  <span className="font-semibold">
                    <Highlighted text={suggestion.value} query={query} />
                  </span>
                  {suggestion.detail ? (
                    <span className="truncate text-[10.5px] text-slate-500">{suggestion.detail}</span>
                  ) : null}
                </button>
              </li>
            ))}
            {query.trim() && !suggestions.some((s) => s.value.toLowerCase() === query.trim().toLowerCase()) ? (
              <li className="border-t border-slate-100 px-2.5 pt-1 text-[10.5px] text-slate-400">
                Enter adds “{query.trim()}” as typed
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {unusedPicks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-slate-400">Quick add:</span>
          {unusedPicks.map((pick) => (
            <button
              key={pick}
              type="button"
              onClick={() => add(pick)}
              className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
            >
              <Plus aria-hidden className="h-3 w-3" />
              {pick}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Bold the typed prefix inside a suggestion, the way a search box does. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-extrabold text-brand-700 underline decoration-brand-200 underline-offset-2">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  )
}
