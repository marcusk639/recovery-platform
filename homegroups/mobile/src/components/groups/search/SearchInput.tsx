import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export interface SearchInputProps extends Omit<TextInputProps, 'style'> {
  /** Current value of the input */
  value: string;
  /** Callback when value changes */
  onChangeText: (text: string) => void;
  /** Icon name to display (MaterialCommunityIcons) */
  iconName?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to show the clear button */
  showClearButton?: boolean;
  /** Custom container style */
  containerStyle?: ViewStyle;
  /** Test ID for the input */
  testID?: string;
}

/**
 * Reusable search input component with icon and clear button
 */
const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChangeText,
  iconName = 'magnify',
  placeholder = 'Search...',
  showClearButton = true,
  containerStyle,
  testID,
  ...textInputProps
}) => {
  const handleClear = () => {
    onChangeText('');
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Icon name={iconName} size={20} color="#757575" style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9E9E9E"
        autoCapitalize="words"
        returnKeyType="search"
        testID={testID}
        {...textInputProps}
      />
      {showClearButton && value.length > 0 && (
        <TouchableOpacity
          onPress={handleClear}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          testID={testID ? `${testID}-clear` : undefined}>
          <Icon name="close-circle" size={18} color="#BDBDBD" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 0,
  },
});

export default SearchInput;
