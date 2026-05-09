import type { FieldMeta } from '@/types'
import { useState } from 'react'

interface FieldControlProps {
  fieldKey: string
  meta: FieldMeta
  value: unknown
  onChange: (key: string, value: unknown) => void
}

// ── String Field ──────────────────────────────────────────────────

export function StringField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  return (
    <input
      type="text"
      className="input-field"
      placeholder={meta.placeholder}
      value={(value as string) ?? ''}
      onChange={(e) => onChange(fieldKey, e.target.value)}
    />
  )
}

// ── Number Field (int / float) ────────────────────────────────────

export function IntField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  return (
    <input
      type="number"
      className="input-field"
      min={meta.min}
      max={meta.max}
      value={(value as number) ?? 0}
      onChange={(e) => onChange(fieldKey, e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
    />
  )
}

export function FloatField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  return (
    <input
      type="number"
      className="input-field"
      min={meta.min}
      max={meta.max}
      step={meta.step ?? 0.1}
      value={(value as number) ?? 0}
      onChange={(e) => onChange(fieldKey, e.target.value === '' ? 0 : parseFloat(e.target.value))}
    />
  )
}

// ── Boolean Field (toggle) ───────────────────────────────────────

export function BooleanField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  const on = (value as boolean) ?? false
  return (
    <button
      type="button"
      className={`toggle-track${on ? ' active' : ''}`}
      onClick={() => onChange(fieldKey, !on)}
      aria-label={meta.label}
    >
      <span className={`toggle-thumb${on ? ' active' : ''}`} />
    </button>
  )
}

// ── Select Field ──────────────────────────────────────────────────

export function SelectField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  return (
    <select
      className="select-field"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(fieldKey, e.target.value)}
    >
      {(meta.options ?? []).map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}

// ── Password Field ────────────────────────────────────────────────

export function PasswordField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  const [show, setShow] = useState(false)
  const isRedacted = value === '***'

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className="input-field pr-9"
        placeholder={meta.placeholder ?? (isRedacted ? '已设置，点击修改...' : '')}
        value={isRedacted ? '' : ((value as string) ?? '')}
        onChange={(e) => onChange(fieldKey, e.target.value || (meta.required ? '' : null))}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
        onClick={() => setShow(!show)}
      >
        {show ? '隐藏' : '显示'}
      </button>
    </div>
  )
}

// ── Tag List Field ────────────────────────────────────────────────

export function TagListField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  const tags = (value as string[]) ?? []
  const [input, setInput] = useState('')

  const addTag = () => {
    const trimmed = input.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange(fieldKey, [...tags, trimmed])
    }
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(fieldKey, tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-2 flex-wrap">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              className="ml-0.5 text-slate-400 hover:text-slate-200"
              onClick={() => removeTag(tag)}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          className="input-field flex-1"
          placeholder={meta.placeholder ?? '输入后按 Enter 添加'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="btn-secondary text-xs px-3 py-1" onClick={addTag}>
          添加
        </button>
      </div>
    </div>
  )
}

// ── Textarea Field ────────────────────────────────────────────────

export function TextareaField({ fieldKey, meta, value, onChange }: FieldControlProps) {
  return (
    <textarea
      className="input-field min-h-[80px] resize-y"
      placeholder={meta.placeholder}
      value={(value as string) ?? ''}
      onChange={(e) => onChange(fieldKey, e.target.value)}
    />
  )
}
