import type { FieldMeta } from '@/types'
import {
  StringField,
  IntField,
  FloatField,
  BooleanField,
  SelectField,
  PasswordField,
  TagListField,
  TextareaField,
} from './FieldControls'

interface ConfigFormProps {
  group: string
  config: Record<string, unknown>
  fieldMeta: Record<string, FieldMeta>
  dirtyFields: Record<string, unknown>
  onFieldChange: (key: string, value: unknown) => void
}

/**
 * Resolve a dotted key path in a nested object.
 * e.g. resolveValue({ llm: { acp: { agent: 'claude' } } }, 'llm.acp.agent') => 'claude'
 */
function resolveValue(obj: Record<string, unknown>, dottedKey: string): unknown {
  const parts = dottedKey.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

/**
 * Get display value for a field considering dirty state.
 */
function getFieldValue(
  fieldKey: string,
  meta: FieldMeta,
  config: Record<string, unknown>,
  dirtyFields: Record<string, unknown>,
): unknown {
  // If field is dirty, show the dirty value
  if (fieldKey in dirtyFields) {
    return dirtyFields[fieldKey]
  }
  // Otherwise resolve from config
  const resolved = resolveValue(config, fieldKey)
  if (resolved !== undefined) return resolved
  // Fall back to default
  return meta.default ?? null
}

/**
 * Map type string to rendering component.
 */
function renderField(
  fieldKey: string,
  meta: FieldMeta,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
) {
  switch (meta.type) {
    case 'int':
      return <IntField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
    case 'float':
      return <FloatField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
    case 'boolean':
      return <BooleanField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
    case 'select':
      return <SelectField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
    case 'password':
      return <PasswordField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
    case 'taglist':
      return <TagListField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
    case 'text':
      return <TextareaField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
    default:
      return <StringField fieldKey={fieldKey} meta={meta} value={value} onChange={onChange} />
  }
}

/**
 * Extract sub-group prefix from a dotted key within a group.
 * e.g. for group "experiment", key "experiment.sandbox.python_path" => "sandbox"
 */
function getSubGroup(key: string, groupKey: string): string | null {
  const withoutGroup = key.startsWith(groupKey + '.') ? key.slice(groupKey.length + 1) : key
  const parts = withoutGroup.split('.')
  return parts.length >= 2 ? parts[0] : null
}

export default function ConfigForm({ group, config, fieldMeta, dirtyFields, onFieldChange }: ConfigFormProps) {
  // Filter fields for this group
  const groupFields = Object.entries(fieldMeta).filter(([_, meta]) => meta.group === group)

  if (groupFields.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic py-8 text-center">
        此分组暂无配置项
      </div>
    )
  }

  // Sort: required first, then by label
  groupFields.sort((a, b) => {
    if (a[1].required !== b[1].required) return a[1].required ? -1 : 1
    return a[1].label.localeCompare(b[1].label)
  })

  // Detect sub-groups within this group
  const subGroups = new Set<string | null>()
  for (const [key] of groupFields) {
    subGroups.add(getSubGroup(key, group))
  }
  const hasSubGroups = subGroups.size > 1 || (subGroups.size === 1 && [...subGroups][0] !== null)

  // Group fields by sub-group if applicable
  const grouped: Record<string, [string, FieldMeta][]> = {}
  if (hasSubGroups) {
    for (const entry of groupFields) {
      const [key] = entry
      const sg = getSubGroup(key, group) ?? '__main__'
      if (!grouped[sg]) grouped[sg] = []
      grouped[sg].push(entry)
    }
  } else {
    grouped['__main__'] = groupFields
  }

  // Sub-group display names
  const subGroupLabels: Record<string, string> = {
    sandbox: '沙箱配置',
    docker: 'Docker 配置',
    ssh_remote: 'SSH 远程配置',
    code_agent: 'CodeAgent 配置',
    opencode: 'OpenCode 配置',
    benchmark_agent: 'BenchmarkAgent 配置',
    figure_agent: 'FigureAgent 配置',
    repair: '实验修复配置',
    cli_agent: 'CLI Agent 配置',
    agentic: 'Agentic 沙箱配置',
    colab_drive: 'Colab Drive 配置',
    acp: 'ACP 配置',
    prm: 'PRM 配置',
    lesson_to_skill: 'Lesson → Skill 配置',
    __main__: '',
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([sg, fields]) => (
        <div key={sg}>
          {sg !== '__main__' && (
            <h4 className="section-heading mb-3 mt-2">
              {subGroupLabels[sg] ?? sg.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </h4>
          )}
          <div className="space-y-4">
            {fields.map(([key, meta]) => {
              const value = getFieldValue(key, meta, config, dirtyFields)
              const isDirty = key in dirtyFields

              return (
                <div key={key}>
                  <label className="field-label" htmlFor={key}>
                    {meta.label}
                    {meta.required && <span className="field-required">*</span>}
                    {isDirty && <span className="ml-2 text-amber-400 text-xs">(已修改)</span>}
                  </label>
                  {renderField(key, meta, value, onFieldChange)}
                  {meta.placeholder && !meta.type.startsWith('tag') && (
                    <p className="field-hint">{meta.placeholder}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
