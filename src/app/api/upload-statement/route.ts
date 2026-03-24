import { NextRequest, NextResponse } from 'next/server';
import { executeParserById } from '@/lib/parsers/registry';
import { getParserCatalogItem, PARSER_CATALOG, type ParserId } from '@/lib/parsers/catalog';

function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx === -1) return '';
  return fileName.substring(idx).toLowerCase();
}

function isFileSupportedByParser(file: File, parserId: ParserId): boolean {
  const parser = getParserCatalogItem(parserId);
  if (!parser) return false;

  const ext = getFileExtension(file.name);
  const mime = (file.type || '').toLowerCase();
  if (parser.supportedExtensions.includes(ext)) return true;
  if (mime && parser.supportedMimeTypes.includes(mime)) return true;

  return false;
}

function supportedTypeLabel(parserId: ParserId): string {
  const parser = getParserCatalogItem(parserId);
  if (!parser) return '';

  const extList = parser.supportedExtensions.join(', ');
  const mimeList = parser.supportedMimeTypes.join(', ');
  if (extList && mimeList) return `${extList} (${mimeList})`;
  return extList || mimeList;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const password = formData.get('password') as string | undefined;
    const parserIdRaw = formData.get('parserId') as string | null;
    const parserId = (parserIdRaw || 'icici_pdf') as ParserId;
    const legacyMode = !parserIdRaw;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const parser = getParserCatalogItem(parserId);
    if (!parser) {
      return NextResponse.json(
        {
          error: 'Invalid parser selected',
          availableParsers: PARSER_CATALOG.map((item) => ({ id: item.id, label: item.label })),
        },
        { status: 400 }
      );
    }

    if (!isFileSupportedByParser(file, parserId)) {
      return NextResponse.json(
        {
          error: `Selected parser "${parser.label}" does not support this file type. Supported: ${supportedTypeLabel(parserId)}`,
          parserId,
          supportedFileTypes: {
            extensions: parser.supportedExtensions,
            mimeTypes: parser.supportedMimeTypes,
          },
        },
        { status: 400 }
      );
    }

    // Convert File to Uint8Array safely
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const result = await executeParserById(parserId, uint8Array, password);

    if (!result.success) {
      if (result.passwordRequired) {
        return NextResponse.json(
          { error: 'Password required or incorrect', passwordRequired: true, parserId },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (legacyMode) {
      return NextResponse.json({
        success: true,
        data: result.payload.legacyData ?? [],
        count: result.payload.legacyData?.length || 0,
      });
    }

    return NextResponse.json({
      success: true,
      parserId,
      meta: result.payload.meta,
      rows: result.payload.rows,
      count: result.payload.rows.length,
    });
  } catch (error: any) {
    console.error('API /upload-statement error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
