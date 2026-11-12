// A web react-native-picker-select: a native <select> with the props RatsPicker
// passes. Option values are indexes, so item values of any type come back intact,
// and index 0 is the placeholder, as in the library.
import { Component, type ComponentType } from 'react';

interface Item {
  label: string;
  value: unknown;
  key?: string | number;
}

interface Props {
  items: Item[];
  value?: unknown;
  onValueChange: (value: unknown, index: number) => void;
  onDonePress?: () => void;
  placeholder?: { label?: string; value?: unknown } | Record<string, never>;
  textInputProps?: { accessibilityLabel?: string; placeholderTextColor?: string };
  Icon?: ComponentType;
  disabled?: boolean;
  itemKey?: string | number;
  style?: unknown;
  useNativeAndroidPickerStyle?: boolean;
}

const DEFAULT_PLACEHOLDER = { label: 'Select an item...', value: null };

export default class RNPickerSelect extends Component<Props, { showPicker: boolean }> {
  state = { showPicker: false };

  private options(): Item[] {
    const placeholder = this.props.placeholder ?? DEFAULT_PLACEHOLDER;
    const hasPlaceholder = Object.keys(placeholder).length > 0;
    return hasPlaceholder ? [{ label: placeholder.label ?? '', value: placeholder.value ?? null }, ...this.props.items] : this.props.items;
  }

  render() {
    const options = this.options();
    const selected = Math.max(0, options.findIndex((item) => item.value === this.props.value));
    const { Icon } = this.props;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <select
          aria-label={this.props.textInputProps?.accessibilityLabel}
          value={String(selected)}
          disabled={this.props.disabled}
          onChange={(event) => {
            const index = Number(event.target.value);
            this.props.onValueChange(options[index]?.value ?? null, index);
            this.props.onDonePress?.();
          }}
          style={{ flex: 1, padding: '8px 10px', font: 'inherit', fontSize: 16 }}>
          {options.map((item, index) => (
            <option key={String(item.key ?? index)} value={String(index)}>
              {item.label}
            </option>
          ))}
        </select>
        {Icon && <Icon />}
      </span>
    );
  }
}
