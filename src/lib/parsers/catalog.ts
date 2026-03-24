export type ParserId = "hdfc_text" | "icici_pdf";

export interface ParserCatalogItem {
  id: ParserId;
  label: string;
  description: string;
  supportedExtensions: string[];
  supportedMimeTypes: string[];
  acceptsPassword: boolean;
}

export const PARSER_CATALOG: ParserCatalogItem[] = [
  {
    id: "hdfc_text",
    label: "HDFC Text Parser",
    description: "Parses HDFC fixed-width text statements.",
    supportedExtensions: [".txt", ".text"],
    supportedMimeTypes: ["text/plain"],
    acceptsPassword: false,
  },
  {
    id: "icici_pdf",
    label: "ICICI PDF Parser",
    description: "Parses ICICI PDF statements and asks for password when required.",
    supportedExtensions: [".pdf"],
    supportedMimeTypes: ["application/pdf"],
    acceptsPassword: true,
  },
];

export function getParserCatalogItem(parserId: string): ParserCatalogItem | undefined {
  return PARSER_CATALOG.find((parser) => parser.id === parserId);
}
