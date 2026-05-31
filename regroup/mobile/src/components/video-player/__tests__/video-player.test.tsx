/**
 * Tests for RatsVideoPlayer component
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import RatsVideoPlayer from '../index';

describe('RatsVideoPlayer', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsVideoPlayer />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with a uri prop without crashing', () => {
    const { toJSON } = render(
      <RatsVideoPlayer uri="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders a View element', () => {
    const { toJSON } = render(<RatsVideoPlayer />);
    const tree = toJSON() as any;
    expect(tree.type).toBe('View');
  });

  it('renders with additional props without crashing', () => {
    const { toJSON } = render(
      <RatsVideoPlayer uri="https://example.com/video" autoPlay={true} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with undefined uri without crashing', () => {
    const { toJSON } = render(<RatsVideoPlayer uri={undefined} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with an empty string uri without crashing', () => {
    const { toJSON } = render(<RatsVideoPlayer uri="" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders a stable tree structure', () => {
    const { toJSON: first } = render(<RatsVideoPlayer />);
    const { toJSON: second } = render(<RatsVideoPlayer />);
    expect(first()).toEqual(second());
  });

  it('accepts style prop without crashing', () => {
    const { toJSON } = render(
      <RatsVideoPlayer style={{ width: 300, height: 200 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders consistently with different uri values', () => {
    const { rerender, toJSON } = render(<RatsVideoPlayer uri="url1" />);
    rerender(<RatsVideoPlayer uri="url2" />);
    expect(toJSON()).toBeTruthy();
  });
});
