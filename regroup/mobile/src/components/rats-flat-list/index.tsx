import React, { useState, useEffect } from 'react';
import { FlatListProps, FlatList } from 'react-native';
import { IOS } from '../../util/platform';

export function RatsFlatList<T>(props: FlatListProps<T>) {
  return <FlatList {...props} removeClippedSubviews={false} />;
}
