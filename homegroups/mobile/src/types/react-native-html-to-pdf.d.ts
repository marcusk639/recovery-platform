declare module 'react-native-html-to-pdf' {
  interface PDFOptions {
    html: string;
    fileName?: string;
    directory?: string;
    base64?: boolean;
    height?: number;
    width?: number;
    padding?: number;
    bgColor?: string;
  }

  interface PDFResult {
    filePath?: string;
    base64?: string;
  }

  interface RNHTMLtoPDF {
    convert(options: PDFOptions): Promise<PDFResult>;
  }

  const RNHTMLtoPDF: RNHTMLtoPDF;
  export default RNHTMLtoPDF;
}

