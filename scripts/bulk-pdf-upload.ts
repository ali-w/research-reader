#!/usr/bin/env tsx
/**
 * Bulk PDF upload script
 *
 * Usage:
 *   npx tsx scripts/bulk-pdf-upload.ts <folder> --api <url> --key <apikey> [options]
 *
 * Options:
 *   --api <url>          Reader API root URL (required)
 *   --key <apikey>       API key (required)
 *   --tags <t1,t2>       Comma-separated tags to apply to all uploads (default: none)
 *   --pdf-type <type>    "typed" or "handwritten" (default: typed)
 *   --no-ocr             Disable text extraction for PDF search
 *   --dry-run            Log what would be uploaded without making API calls
 */

import * as fs from 'fs';
import * as path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    folder: '',
    api: '',
    key: '',
    tags: [] as string[],
    pdfType: 'typed' as 'typed' | 'handwritten',
    extractOcr: true,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (i === 0 && !args[i].startsWith('--')) {
      result.folder = args[i];
    } else if (args[i] === '--api') {
      result.api = args[++i];
    } else if (args[i] === '--key') {
      result.key = args[++i];
    } else if (args[i] === '--tags') {
      result.tags = args[++i].split(',').map((t) => t.trim()).filter(Boolean);
    } else if (args[i] === '--pdf-type') {
      const val = args[++i];
      if (val === 'typed' || val === 'handwritten') result.pdfType = val;
    } else if (args[i] === '--no-ocr') {
      result.extractOcr = false;
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    }
  }

  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadPdf(
  filePath: string,
  title: string,
  opts: { api: string; key: string; pdfType: 'typed' | 'handwritten'; tags: string[]; extractOcr: boolean }
): Promise<number> {
  // 1. Initiate upload
  const initRes = await fetch(`${opts.api}/articles/upload-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': opts.key },
    body: JSON.stringify({
      title,
      pdf_type: opts.pdfType,
      extract_ocr: opts.extractOcr,
      tags: opts.tags,
      saved: true,
    }),
  });
  if (!initRes.ok) throw new Error(`upload-pdf failed: ${initRes.status} ${await initRes.text()}`);
  const { id, upload_url, gcs_uri } = await initRes.json() as { id: number; upload_url: string; gcs_uri: string };

  // 2. PUT file directly to GCS
  const fileBuffer = fs.readFileSync(filePath);
  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: fileBuffer,
  });
  if (!putRes.ok) throw new Error(`GCS PUT failed: ${putRes.status}`);

  // 3. Confirm upload to trigger AI processing
  const confirmRes = await fetch(`${opts.api}/articles/${id}/confirm-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': opts.key },
    body: JSON.stringify({ gcs_uri }),
  });
  if (!confirmRes.ok) throw new Error(`confirm-upload failed: ${confirmRes.status}`);

  return id;
}

async function main() {
  const opts = parseArgs();

  if (!opts.folder || !opts.api || !opts.key) {
    console.error('Usage: npx tsx scripts/bulk-pdf-upload.ts <folder> --api <url> --key <apikey>');
    process.exit(1);
  }

  if (!fs.existsSync(opts.folder)) {
    console.error(`Folder not found: ${opts.folder}`);
    process.exit(1);
  }

  const pdfs = fs.readdirSync(opts.folder)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();

  if (pdfs.length === 0) {
    console.log('No PDF files found in folder.');
    return;
  }

  console.log(`Found ${pdfs.length} PDF(s) | type=${opts.pdfType} | ocr=${opts.extractOcr} | tags=[${opts.tags.join(', ')}]${opts.dryRun ? ' | DRY RUN' : ''}`);
  console.log('');

  let succeeded = 0;
  let failed = 0;

  for (const filename of pdfs) {
    const filePath = path.join(opts.folder, filename);
    const title = filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
    const sizeMb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);

    if (opts.dryRun) {
      console.log(`  [dry-run] ${filename} → "${title}" (${sizeMb} MB)`);
      succeeded++;
      continue;
    }

    try {
      const id = await uploadPdf(filePath, title, opts);
      console.log(`  ✓ ${filename} → article ${id} (${sizeMb} MB)`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${filename}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }

    // Rate-limit: 1 second between uploads to avoid overwhelming Gemini processing queue
    await sleep(1000);
  }

  console.log('');
  console.log(`Done: ${succeeded} succeeded, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
