declare module 'ngeohash' {
  interface GeohashBounds {
    minlat: number;
    minlon: number;
    maxlat: number;
    maxlon: number;
  }

  function encode(latitude: number, longitude: number, precision?: number): string;
  function decode(hashstring: string): { latitude: number; longitude: number };
  function decode_bbox(hashstring: string): [number, number, number, number];
  function neighbor(hashstring: string, direction: [number, number]): string;
  function neighbors(hashstring: string): string[];

  export { encode, decode, decode_bbox, neighbor, neighbors };
  export default { encode, decode, decode_bbox, neighbor, neighbors };
}

declare module 'tabletojson' {
  interface ConvertOptions {
    useFirstRowForHeadings?: boolean;
    headers?: string[];
    stripHtmlFromHeadings?: boolean;
    stripHtmlFromCells?: boolean;
    stripHtml?: boolean;
    forceIndexAsNumber?: boolean;
    countDuplicateHeadings?: boolean;
    ignoreColumns?: number[];
    onlyColumns?: number[];
    ignoreHiddenRows?: boolean;
    id?: string[];
    headingTransformer?: (value: string) => string;
    containsClasses?: string[];
    limitrows?: number | null;
  }

  const Tabletojson: {
    convert(html: string, options?: ConvertOptions): Array<Array<Record<string, string>>>;
    convertUrl(url: string, options?: ConvertOptions): Promise<Array<Array<Record<string, string>>>>;
  };

  export = Tabletojson;
}
