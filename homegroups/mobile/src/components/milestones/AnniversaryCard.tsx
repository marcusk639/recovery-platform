import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

interface AnniversaryCardProps {
  groupName: string;
  memberName: string;
  days: number;
  date: Date;
  anonymous?: boolean;
}

/**
 * AnniversaryCard — a visual card for sharing milestone celebrations.
 *
 * Designed to be captured as PDF via RNHTMLtoPDF (see generateAnniversaryCardHTML).
 * The React Native component itself serves as a preview in the UI.
 */
const AnniversaryCard: React.FC<AnniversaryCardProps> = ({
  groupName,
  memberName,
  days,
  date,
  anonymous = false,
}) => {
  const displayName = anonymous ? `A Member of ${groupName}` : memberName;
  const yearCount = Math.floor(days / 365);
  const daysLabel =
    days >= 365
      ? `${yearCount} ${yearCount === 1 ? 'Year' : 'Years'}`
      : `${days} Days`;

  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={styles.card}>
      {/* Top accent bar */}
      <View style={styles.accentBar} />

      {/* Group name */}
      <Text style={styles.groupName}>{groupName}</Text>

      {/* Separator */}
      <View style={styles.separator} />

      {/* Main celebration text */}
      <Text style={styles.celebrationLabel}>Celebrating</Text>
      <Text style={styles.daysLabel}>{daysLabel}</Text>
      <Text style={styles.subtitle}>of Recovery</Text>

      {/* Separator */}
      <View style={styles.separator} />

      {/* Member name */}
      <Text style={styles.memberName}>{displayName}</Text>

      {/* Date */}
      <Text style={styles.dateText}>{formattedDate}</Text>

      {/* Bottom accent bar */}
      <View style={styles.accentBar} />
    </View>
  );
};

const GOLD = '#C9A84C';
const DARK_GOLD = '#8B6914';
const CREAM = '#FFF8E7';
const AMBER_LIGHT = '#FFF3CD';

const styles = StyleSheet.create({
  card: {
    backgroundColor: CREAM,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: GOLD,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#8B6914',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  accentBar: {
    width: 60,
    height: 4,
    backgroundColor: GOLD,
    borderRadius: 2,
    marginVertical: 8,
  },
  groupName: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK_GOLD,
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  separator: {
    width: '60%',
    height: 1,
    backgroundColor: GOLD,
    opacity: 0.4,
    marginVertical: 12,
  },
  celebrationLabel: {
    fontSize: 14,
    color: '#8B6914',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  daysLabel: {
    fontSize: 48,
    fontWeight: '800',
    color: DARK_GOLD,
    textAlign: 'center',
    lineHeight: 56,
  },
  subtitle: {
    fontSize: 18,
    color: DARK_GOLD,
    fontWeight: '300',
    letterSpacing: 1,
    marginTop: 2,
  },
  memberName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3D2B1F',
    textAlign: 'center',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 13,
    color: '#8B6914',
    fontStyle: 'italic',
    marginBottom: 4,
  },
});

/**
 * Generates HTML for the anniversary card — used with RNHTMLtoPDF.
 */
export function generateAnniversaryCardHTML(
  groupName: string,
  memberName: string,
  days: number,
  date: Date,
  anonymous = false,
): string {
  const displayName = anonymous ? `A Member of ${groupName}` : memberName;
  const yearCount = Math.floor(days / 365);
  const daysLabel =
    days >= 365
      ? `${yearCount} ${yearCount === 1 ? 'Year' : 'Years'}`
      : `${days} Days`;

  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @page { margin: 0; size: 400px 500px; }
    body {
      margin: 0; padding: 0;
      background: #FFFDF5;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
      font-family: Georgia, "Times New Roman", serif;
    }
    .card {
      width: 360px;
      background: #FFF8E7;
      border: 2.5px solid #C9A84C;
      border-radius: 16px;
      padding: 32px 28px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(139, 105, 20, 0.2);
      margin: auto;
    }
    .accent { width: 60px; height: 4px; background: #C9A84C; border-radius: 2px; margin: 8px auto; }
    .group-name {
      font-size: 12px; font-weight: 600; color: #8B6914;
      letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;
    }
    .separator { width: 60%; height: 1px; background: rgba(201,168,76,0.4); margin: 14px auto; }
    .celebrating { font-size: 12px; color: #8B6914; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 4px; }
    .days { font-size: 52px; font-weight: 800; color: #8B6914; line-height: 1.1; }
    .subtitle { font-size: 18px; color: #8B6914; font-weight: 300; letter-spacing: 1px; margin-top: 4px; }
    .member-name { font-size: 22px; font-weight: 700; color: #3D2B1F; margin-bottom: 6px; }
    .date { font-size: 13px; color: #8B6914; font-style: italic; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="accent"></div>
    <div class="group-name">${groupName}</div>
    <div class="separator"></div>
    <div class="celebrating">Celebrating</div>
    <div class="days">${daysLabel}</div>
    <div class="subtitle">of Recovery</div>
    <div class="separator"></div>
    <div class="member-name">${displayName}</div>
    <div class="date">${formattedDate}</div>
    <div class="accent"></div>
  </div>
</body>
</html>`;
}

export default AnniversaryCard;
