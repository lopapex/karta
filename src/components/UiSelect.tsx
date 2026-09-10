import * as Select from '@radix-ui/react-select'
import { CaretDown, Check } from '@phosphor-icons/react'

interface SelectOption {
  value: string
  label: string
}

interface UiSelectProps {
  value?: string
  placeholder?: string
  options: SelectOption[]
  onValueChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}

export function UiSelect({
  value,
  placeholder,
  options,
  onValueChange,
  disabled,
  ariaLabel,
}: UiSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger className="select-trigger" aria-label={ariaLabel}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon><CaretDown size={16} /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={5}>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item className="select-item" key={option.value} value={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator><Check size={15} /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

