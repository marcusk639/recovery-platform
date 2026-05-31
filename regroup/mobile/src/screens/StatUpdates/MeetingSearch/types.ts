/**
 * Shared types for MeetingSearch components
 * Phase 4.1: Extracted from MeetingSearch.tsx
 */
import { TextStyle } from 'react-native';
import { fontSize } from '../../../styles/theme';

export type WeekDay =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'all';

export const MEETING_DESCRIPTION_TEXT: TextStyle = {
  fontSize: fontSize.regular_medium,
};
