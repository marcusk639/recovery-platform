/**
 * Tests for RatsFlatList component
 */

import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { RatsFlatList } from '../index';

jest.mock('../../../util/platform', () => ({ IOS: false }));

interface Item {
  id: string;
  label: string;
}

const makeData = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({ id: String(i), label: `Item ${i}` }));

const renderItem = ({ item }: { item: Item }) => <Text testID={`item-${item.id}`}>{item.label}</Text>;

describe('RatsFlatList', () => {
  it('renders without crashing with empty data', () => {
    const { toJSON } = render(
      <RatsFlatList data={[]} renderItem={renderItem} keyExtractor={item => item.id} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders items from data', () => {
    const data = makeData(3);
    const { getByText } = render(
      <RatsFlatList data={data} renderItem={renderItem} keyExtractor={item => item.id} />,
    );
    expect(getByText('Item 0')).toBeTruthy();
    expect(getByText('Item 1')).toBeTruthy();
    expect(getByText('Item 2')).toBeTruthy();
  });

  it('renders correct number of items', () => {
    const data = makeData(5);
    const { getAllByText } = render(
      <RatsFlatList
        data={data}
        renderItem={({ item }) => <Text>row</Text>}
        keyExtractor={item => item.id}
      />,
    );
    expect(getAllByText('row')).toHaveLength(5);
  });

  it('renders with a null data prop without crashing', () => {
    const { toJSON } = render(
      <RatsFlatList data={null as any} renderItem={renderItem} keyExtractor={item => item.id} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders a ListEmptyComponent when data is empty', () => {
    const { getByText } = render(
      <RatsFlatList
        data={[]}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text>No results</Text>}
      />,
    );
    expect(getByText('No results')).toBeTruthy();
  });

  it('renders ListHeaderComponent when provided', () => {
    const { getByText } = render(
      <RatsFlatList
        data={makeData(2)}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={<Text>Header</Text>}
      />,
    );
    expect(getByText('Header')).toBeTruthy();
  });

  it('renders ListFooterComponent when provided', () => {
    const { getByText } = render(
      <RatsFlatList
        data={makeData(2)}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListFooterComponent={<Text>Footer</Text>}
      />,
    );
    expect(getByText('Footer')).toBeTruthy();
  });

  it('passes through extra FlatList props without crashing', () => {
    const { toJSON } = render(
      <RatsFlatList
        data={makeData(2)}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with a single-item data array', () => {
    const { getByText } = render(
      <RatsFlatList
        data={[{ id: '0', label: 'Only Item' }]}
        renderItem={renderItem}
        keyExtractor={item => item.id}
      />,
    );
    expect(getByText('Only Item')).toBeTruthy();
  });
});
