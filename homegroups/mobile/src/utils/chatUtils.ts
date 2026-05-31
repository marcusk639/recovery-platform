import React from 'react';
import {Text, Linking, TextStyle} from 'react-native';
import {GroupMember} from '../types';

/**
 * Format a timestamp to a readable time string
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format file size in bytes to human-readable string
 */
export function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  } else if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Format duration in seconds to MM:SS format
 */
export function formatDuration(durationInSeconds: number): string {
  const minutes = Math.floor(durationInSeconds / 60);
  const seconds = Math.floor(durationInSeconds % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/**
 * Generate a deterministic thread ID for two users
 */
export function generateThreadId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join('_');
}

/**
 * Parse message text for mentions and URLs
 * @param text - The message text to parse
 * @param options - Parsing options
 * @returns Array of React nodes representing the parsed text
 */
export function parseMessageText(
  text: string,
  options?: {
    parseMentions?: boolean;
    members?: GroupMember[];
    currentUserId?: string;
    mentionHighlightStyle?: TextStyle;
    mentionTextStyle?: TextStyle;
    linkTextStyle?: TextStyle;
  },
): React.ReactNode[] {
  if (!text) return [];

  const {
    parseMentions = false,
    members = [],
    currentUserId,
    mentionHighlightStyle,
    mentionTextStyle,
    linkTextStyle,
  } = options || {};

  // Simpler Regex: Match @ followed by non-space characters for username
  const mentionPattern = /@(\S+)/g;
  // Basic URL regex
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const pattern = new RegExp(
    `(${mentionPattern.source})|(${urlPattern.source})`,
    'g',
  );

  const parts = text
    .split(pattern)
    .filter(part => part !== undefined && part !== '');

  return parts.map((part, index) => {
    // Check if it's a mention
    if (parseMentions) {
      const mentionMatch = part.match(/^@(\S+)$/);
      if (mentionMatch) {
        const mentionedName = mentionMatch[1];
        const member = members.find(
          m =>
            m.name.toLowerCase() === mentionedName.toLowerCase() &&
            m.id === currentUserId,
        );
        const isMentioningCurrentUser = !!member;

        return React.createElement(
          Text,
          {
            key: `mention-${index}`,
            style: isMentioningCurrentUser
              ? mentionHighlightStyle
              : mentionTextStyle,
          },
          part,
        );
      }
    }

    // Check if it's a URL
    if (part.match(urlPattern)) {
      return React.createElement(
        Text,
        {
          key: `url-${index}`,
          style: linkTextStyle,
          onPress: () => Linking.openURL(part),
        },
        part,
      );
    }

    // Regular text
    return React.createElement(Text, {key: `text-${index}`}, part);
  });
}
