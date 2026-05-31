/**
 * Types specific to recovery literature
 */

export interface LiteratureItem {
  id: string;
  title: string;
  type: 'book' | 'pamphlet' | 'workbook' | 'card' | 'other';
  program: 'AA' | 'NA' | 'other';
  description?: string;
  imageUrl?: string;
  price?: number;
  itemCode?: string;
  isApproved: boolean;
  language: string;
  publicationDate?: Date;
  publisher: string;
  pages?: number;
  tags?: string[];
}

export interface GroupLiteratureInventory {
  id: string;
  groupId: string;
  items: {
    literatureId: string;
    title: string;
    quantity: number;
    lastUpdated: Date;
  }[];
  lastUpdated: Date;
  updatedBy: string;
}
