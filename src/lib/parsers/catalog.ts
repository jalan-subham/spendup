export type ParserId = "hdfc_text" | "icici_xls";

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
    id: "icici_xls",
    label: "ICICI XLS Parser",
    description: "Parses ICICI transaction history exported as XLS/XLSX files.",
    supportedExtensions: [".xls", ".xlsx"],
    supportedMimeTypes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    acceptsPassword: false,
  },
];

export function getParserCatalogItem(parserId: string): ParserCatalogItem | undefined {
  return PARSER_CATALOG.find((parser) => parser.id === parserId);
}
