import { useEffect, useState } from 'react'
import Button from './Button'
import './Filter.css'

function Filter({ onChange }) {
  const emptyFilters = {
    languageId: '',
    levelId: '',
    sourceId: '',
    categoryId: '',
  }

  const [filters, setFilters] = useState({
    languageId: '',
    levelId: '',
    sourceId: '',
    categoryId: '',
  })

  const [options, setOptions] = useState({
    languages: [],
    levels: [],
    sources: [],
    categories: [],
  })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/filters', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((payload) => {
        setOptions({
          languages: Array.isArray(payload?.languages) ? payload.languages : [],
          levels: Array.isArray(payload?.levels) ? payload.levels : [],
          sources: Array.isArray(payload?.sources) ? payload.sources : [],
          categories: Array.isArray(payload?.categories) ? payload.categories : [],
        })
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return
        setOptions({ languages: [], levels: [], sources: [], categories: [] })
      })

    return () => controller.abort()
  }, [])

  const handleChange = (key, value) => {
    const next = { ...filters, [key]: value }
    setFilters(next)
    if (onChange) onChange(next)
  }

  const handleClear = () => {
    setFilters(emptyFilters)
    if (onChange) onChange(emptyFilters)
  }

  return (
    <div className="filter-wrap">
      <div className="filter-panel">
        <div className="filter-field">
          <label htmlFor="filter-language">Language</label>
          <select
            id="filter-language"
            className="filter-select"
            value={filters.languageId}
            onChange={(e) => handleChange('languageId', e.target.value)}
          >
            <option value="">Any</option>
            {options.languages.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
        </div>


        <div className="filter-field">
          <label htmlFor="filter-difficulty">Difficulty Level</label>
          <select
            id="filter-difficulty"
            className="filter-select"
            value={filters.levelId}
            onChange={(e) => handleChange('levelId', e.target.value)}
          >
            <option value="">Any</option>
            {options.levels.map((lv) => (
              <option key={lv.id} value={String(lv.id)}>
                {lv.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="filter-source">Repository Source</label>
          <select
            id="filter-source"
            className="filter-select"
            value={filters.sourceId}
            onChange={(e) => handleChange('sourceId', e.target.value)}
          >
            <option value="">Any</option>
            {options.sources.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="filter-category">Tag</label>
          <select
            id="filter-category"
            className="filter-select"
            value={filters.categoryId}
            onChange={(e) => handleChange('categoryId', e.target.value)}
          >
            <option value="">Any</option>
            {options.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <Button className="filter-clear" onClick={handleClear}>
          Clear Filters
        </Button>
      </div>
    </div>
  )
}

export default Filter
