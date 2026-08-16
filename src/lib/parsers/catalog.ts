export type ParserId = "hdfc_text" | "icici_xls" | "hdfc_swiggy_cc_pdf";

export interface ParserCatalogItem {
  id: ParserId;
  label: string;
  description: string;
  supportedExtensions: string[];
  supportedMimeTypes: string[];
  acceptsPassword: boolean;
  bankKeyword: "hdfc" | "icici";
  statementType: "bank_account" | "credit_card";
}

export const PARSER_CATALOG: ParserCatalogItem[] = [
  {
    id: "hdfc_text",
    label: "HDFC Text Parser",
    description: "Parses HDFC fixed-width text statements.",
    supportedExtensions: [".txt", ".text"],
    supportedMimeTypes: ["text/plain"],
    acceptsPassword: false,
    bankKeyword: "hdfc",
    statementType: "bank_account",
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
    bankKeyword: "icici",
    statementType: "bank_account",
  },
  {
    id: "hdfc_swiggy_cc_pdf",
    label: "HDFC Swiggy CC PDF Parser",
    description: "Parses HDFC Swiggy credit-card PDF statements (supports password-protected PDFs).",
    supportedExtensions: [".pdf"],
    supportedMimeTypes: ["application/pdf"],
    acceptsPassword: true,
    bankKeyword: "hdfc",
    statementType: "credit_card",
  },
];

export function getParserCatalogItem(parserId: string): ParserCatalogItem | undefined {
  return PARSER_CATALOG.find((parser) => parser.id === parserId);
}

