// Type declarations for modules without type definitions

declare module '@firebase/rules-unit-testing' {
  export function initializeTestEnvironment(config: any): Promise<any>;
  export function assertSucceeds(pr: Promise<any>): Promise<any>;
  export function assertFails(pr: Promise<any>): Promise<any>;
  export interface RulesTestEnvironment {
    authenticatedContext(uid: string, claims?: any): any;
    unauthenticatedContext(): any;
    withSecurityRulesDisabled(fn: (context: any) => Promise<void>): Promise<void>;
    cleanup(): Promise<void>;
    clearFirestore(): Promise<void>;
    clearStorage(): Promise<void>;
  }
  export type RulesTestContext = any;
}

declare module 'firebase/storage' {
  export function ref(storage: any, path?: string): any;
  export function uploadBytes(ref: any, data: any, metadata?: any): Promise<any>;
  export function getDownloadURL(ref: any): Promise<string>;
  export function deleteObject(ref: any): Promise<void>;
}

declare module 'react-native-simple-radio-button' {
  import { Component } from 'react';
  import { StyleProp, ViewStyle, TextStyle } from 'react-native';

  interface RadioButtonProps {
    [key: string]: any;
  }

  export class RadioButton extends Component<RadioButtonProps> {}
  export class RadioButtonInput extends Component<RadioButtonProps> {}
  export class RadioButtonLabel extends Component<RadioButtonProps> {}

  export default class RadioForm extends Component<RadioButtonProps> {}
}

declare module 'ngeohash' {
  export function encode(
    latitude: number,
    longitude: number,
    precision?: number,
  ): string;
  export function decode(hashstring: string): {
    latitude: number;
    longitude: number;
  };
  export function decode_bbox(
    hashstring: string,
  ): [number, number, number, number];
  export function bboxes(
    minlat: number,
    minlon: number,
    maxlat: number,
    maxlon: number,
    precision?: number,
  ): string[];
  export function neighbor(
    hashstring: string,
    direction: [number, number],
  ): string;
  export function neighbors(hashstring: string): string[];
}
