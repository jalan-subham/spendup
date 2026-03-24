import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

// Types
export interface Transaction {
  date: string;
  description: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  balance: number;
}

export interface ParseResult {
  success: boolean;
  transactions?: Transaction[];
  error?: string;
  passwordRequired?: boolean;
}

/**
 * Helper to parse Indian currency strings to numbers
 * Example: "1,03,862.00" -> 103862.00
 */
function parseAmount(amtStr: string): number {
  return parseFloat(amtStr.replace(/,/g, ''));
}

/**
 * Parses an ICICI Bank Statement PDF
 */
export async function parseIciciStatement(
  buffer: Uint8Array,
  password?: string
): Promise<ParseResult> {
  try {
    // Attempt to load the document
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      password: password,
      useSystemFonts: true,
    });

    const pdfDocument = await loadingTask.promise;

    let fullText = '';

    // Extract text from all pages
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      
      // For each line, we try to reconstruct it. 
      // pdf.js items aren't always perfectly ordered or spaced, but .join(' ') is usually good enough for ICICI statements
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + ' \n ';
    }

    return extractTransactions(fullText);
  } catch (error: any) {
    if (error.name === 'PasswordException' || error.message?.includes('Password')) {
      return { success: false, error: 'Password required or incorrect', passwordRequired: true };
    }
    console.error('Error parsing PDF:', error);
    return { success: false, error: error.message || 'Unknown parsing error' };
  }
}

function extractTransactions(text: string): ParseResult {
  // We only want the Savings Account transactions, not Fixed Deposits
  const startKeyword = "Statement of Transactions in Savings Account";
  const startIndex = text.indexOf(startKeyword);
  
  let processText = text;
  if (startIndex !== -1) {
    processText = text.substring(startIndex);
  }

  const transactions: Transaction[] = [];
  
  // 1. Find the starting balance ("B/F" line)
  const bfMatch = processText.match(/(\d{2}-\d{2}-\d{4})\s+B\/F\s+([\d,]+\.\d{2})/i);
  let runningBalance = 0;
  if (bfMatch) {
    runningBalance = parseAmount(bfMatch[2]);
  } else {
    console.warn("Could not find Brought Forward (B/F) balance. Running balance logic might be off for the very first transaction if it's not present.");
  }

  // 2. Tokenize by dates
  const chunks = processText.split(/(?=\d{2}-\d{2}-\d{4}\s+)/);

  for (const chunk of chunks) {
    const chunkTrimmed = chunk.trim();
    if (!chunkTrimmed.match(/^\d{2}-\d{2}-\d{4}/)) continue; // Must start with date
    
    // Ignore B/F line
    if (chunkTrimmed.includes('B/F')) continue;

    // Extract Date
    const dateStr = chunkTrimmed.substring(0, 10);
    
    // The chunk should contain numbers at the end: AMOUNT and BALANCE
    // Because of weird wrapping, let's find all numbers that look like XX.XX or X,XX.XX at the end of the chunk
    const numberMatches = [...chunkTrimmed.matchAll(/([\d,]+\.\d{2})/g)];
    
    if (numberMatches.length >= 2) {
      // The last two numbers are usually AMOUNT and BALANCE
      const balanceStr = numberMatches[numberMatches.length - 1][1];
      const amountStr = numberMatches[numberMatches.length - 2][1];
      
      const balance = parseAmount(balanceStr);
      const amount = parseAmount(amountStr);
      
      // Determine if deposit or withdrawal based on running balance
      // Wait, let's check Math.abs to account for floating point weirdness
      const diffDeposit = Math.abs((runningBalance + amount) - balance);
      const diffWithdrawal = Math.abs((runningBalance - amount) - balance);
      
      let type: 'DEPOSIT' | 'WITHDRAWAL' = 'WITHDRAWAL';
      
      if (diffDeposit < 0.01) {
        type = 'DEPOSIT';
        runningBalance = balance;
      } else if (diffWithdrawal < 0.01) {
        type = 'WITHDRAWAL';
        runningBalance = balance;
      } else {
        // If it doesn't match perfectly, ICICI might have just skipped reporting a grouped transaction or there's an error in parsing.
        // Let's fallback to checking if balance increased or decreased compared to running balance
        if (balance > runningBalance) {
          type = 'DEPOSIT';
        } else {
          type = 'WITHDRAWAL';
        }
        runningBalance = balance; // Resync
      }

      // Description is everything between the date and the amount
      // Let's remove the amounts from the text
      let description = chunkTrimmed
        .substring(10) // remove date
        .replace(amountStr, '')
        .replace(balanceStr, '')
        .trim();
      
      // Clean up random noise (UPI/, redundant spaces, "Paid via C/")
      // We'll keep it simple for now, just compress whitespace
      description = description.replace(/\s+/g, ' ');

      transactions.push({
        date: dateStr,
        description,
        type,
        amount,
        balance
      });
    }
  }

  return {
    success: true,
    transactions
  };
}
