// pdf-extractor.ts - Google Cloud Vision API implementation

interface ExtractionOptions {
  maxPages?: number;
  headerFooterFilter?: boolean;
}

interface PageResult {
  page: number;
  text: string;
  confidence?: number;
}

interface ExtractionResult {
  pages: PageResult[];
  warnings: string[];
}

/**
 * Extract text from PDF/Image using Google Cloud Vision API
 */
export async function extractTextFromBlob(
  fileData: Blob,
  mimeType: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const { maxPages = 60 } = options;
  const warnings: string[] = [];

  try {
    const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');

    if (!GOOGLE_VISION_API_KEY) {
      throw new Error('GOOGLE_CLOUD_VISION_API_KEY not configured');
    }

    console.log(`Starting Google Vision extraction for ${mimeType}, size: ${fileData.size} bytes`);

    if (mimeType === 'application/pdf') {
      return await extractPdfWithVision(fileData, GOOGLE_VISION_API_KEY, maxPages, warnings);
    } else if (mimeType.startsWith('image/')) {
      return await extractImageWithVision(fileData, GOOGLE_VISION_API_KEY, warnings);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  } catch (error) {
    console.error('Google Vision extraction error:', error);

    return {
      pages: [{
        page: 1,
        text: `[Error extracting text: ${error instanceof Error ? error.message : 'Unknown error'}]`
      }],
      warnings: [`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

async function extractImageWithVision(
  imageData: Blob,
  apiKey: string,
  warnings: string[]
): Promise<ExtractionResult> {
  const base64Image = await blobToBase64(imageData);

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION',
              maxResults: 1
            },
            {
              type: 'TEXT_DETECTION',
              maxResults: 1
            }
          ],
          imageContext: {
            languageHints: ['en']
          }
        }]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Vision API error:', response.status, errorText);
    throw new Error(`Vision API error: ${response.status}`);
  }

  const result = await response.json();

  if (result.responses?.[0]?.error) {
    throw new Error(`Vision API error: ${result.responses[0].error.message}`);
  }

  const imageResponse = result.responses?.[0] ?? {};
  const fullTextAnnotation = imageResponse.fullTextAnnotation;
  let text = fullTextAnnotation?.text?.trim() ?? '';

  if (!text && fullTextAnnotation?.pages?.length) {
    text = rebuildTextFromAnnotation(fullTextAnnotation).trim();
    if (text) {
      warnings.push('Reconstructed image text from Vision annotation hierarchy');
    }
  }

  if (!text) {
    const textAnnotations: Array<{ description?: string }> | undefined = imageResponse.textAnnotations;
    if (Array.isArray(textAnnotations) && textAnnotations.length > 0) {
      text = textAnnotations[0]?.description?.trim() ?? '';
      if (text) {
        warnings.push('Used Vision API textAnnotations fallback for image OCR');
      }
    }
  }

  if (!text) {
    warnings.push('No text detected in image');
  } else if (text.length < 50) {
    warnings.push('Very little text detected in image');
  }

  const averageConfidence = calculateAverageConfidence(fullTextAnnotation);
  const confidence = typeof averageConfidence === 'number' && averageConfidence > 0
    ? averageConfidence
    : undefined;

  console.log(`✓ Image OCR complete: ${text.length} characters extracted`);

  return {
    pages: [{
      page: 1,
      text,
      confidence
    }],
    warnings
  };
}

async function extractPdfWithVision(
  pdfData: Blob,
  apiKey: string,
  maxPages: number,
  warnings: string[]
): Promise<ExtractionResult> {
  const fileSize = pdfData.size;
  const sizeMB = fileSize / (1024 * 1024);

  console.log(`Processing PDF: ${sizeMB.toFixed(2)} MB, max pages: ${maxPages}`);

  if (fileSize < 10 * 1024 * 1024) {
    return await extractPdfInBatches(pdfData, apiKey, maxPages, warnings);
  } else {
    warnings.push('PDF is large (>10MB), processing may be slower');
    return await extractPdfInBatches(pdfData, apiKey, maxPages, warnings);
  }
}

/**
 * Extract all pages from PDF using Google Vision API
 * Note: The synchronous API processes all pages automatically, doesn't support page selection
 */
async function extractPdfInBatches(
  pdfData: Blob,
  apiKey: string,
  maxPages: number,
  warnings: string[]
): Promise<ExtractionResult> {
  const base64Pdf = await blobToBase64(pdfData);
  const allPages: PageResult[] = [];

  console.log(`Processing PDF with Vision API (max ${maxPages} pages)...`);

  try {
    const requestPayload = {
      requests: [{
        inputConfig: {
          content: base64Pdf,
          mimeType: 'application/pdf'
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION'
          }
        ]
      }]
    };

    console.log('Vision API Request:', JSON.stringify({
      ...requestPayload,
      requests: [{
        ...requestPayload.requests[0],
        inputConfig: {
          ...requestPayload.requests[0].inputConfig,
          content: `[base64 PDF, ${base64Pdf.length} chars]`
        }
      }]
    }, null, 2));

    // Make single request - synchronous API processes all pages automatically
    const response = await fetch(
      `https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vision API HTTP Error:', response.status);
      console.error('Vision API Error Response:', errorText);

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          throw new Error(`Vision API: ${errorJson.error.message}`);
        }
      } catch {
        // Use generic error if parsing fails
      }

      throw new Error(`Vision API error: ${response.status}`);
    }

    const result = await response.json();

    console.log('Vision API Response:', JSON.stringify({
      responseCount: result.responses?.length || 0,
      hasError: !!result.responses?.[0]?.error,
      firstResponse: result.responses?.[0] ? {
        hasFullTextAnnotation: !!result.responses[0].fullTextAnnotation,
        textLength: result.responses[0].fullTextAnnotation?.text?.length || 0,
        pageCount: result.responses[0].fullTextAnnotation?.pages?.length || 0
      } : null
    }, null, 2));

    if (result.responses?.[0]?.error) {
      throw new Error(`Vision API error: ${result.responses[0].error.message}`);
    }

    // Parse all page responses (API returns all pages)
    const responses = result.responses || [];

    for (let i = 0; i < responses.length && i < maxPages; i++) {
      const pageResponse = responses[i];
      const pageNum = i + 1;

      if (pageResponse.error) {
        warnings.push(`Page ${pageNum} error: ${pageResponse.error.message}`);
        continue;
      }

      const fullTextAnnotation = pageResponse.fullTextAnnotation;
      let text = fullTextAnnotation?.text?.trim() ?? '';

      if (!text && fullTextAnnotation?.pages?.length) {
        text = rebuildTextFromAnnotation(fullTextAnnotation).trim();
        if (text) {
          warnings.push(`Reconstructed text for PDF page ${pageNum} from annotation hierarchy`);
        }
      }

      if (!text) {
        warnings.push(`Page ${pageNum} has no detectable text`);
        text = '[No text extracted]';
      } else if (text.length < 20) {
        warnings.push(`Page ${pageNum} has very little text`);
      }

      allPages.push({
        page: pageNum,
        text,
        confidence: calculateAverageConfidence(fullTextAnnotation)
      });
    }
  } catch (error) {
    console.error(`Error processing PDF:`, error);
    warnings.push(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }

  if (allPages.length === 0) {
    warnings.push('No text could be extracted from PDF');
    allPages.push({
      page: 1,
      text: '[No text extracted]'
    });
  }

  const totalChars = allPages.reduce((sum, p) => sum + p.text.length, 0);
  const avgConfidence = allPages.reduce((sum, p) => sum + (p.confidence || 0), 0) / allPages.length;

  console.log(`✓ PDF OCR complete: ${allPages.length} pages, ${totalChars} characters, avg confidence: ${(avgConfidence * 100).toFixed(1)}%`);

  if (avgConfidence < 0.7) {
    warnings.push(`Low OCR confidence (${(avgConfidence * 100).toFixed(1)}%) - document may be poor quality`);
  }

  return {
    pages: allPages,
    warnings
  };
}

function calculateAverageConfidence(fullTextAnnotation: any): number | undefined {
  if (!fullTextAnnotation?.pages) {
    return undefined;
  }

  let totalConfidence = 0;
  let wordCount = 0;

  for (const page of fullTextAnnotation.pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          if (word.confidence !== undefined) {
            totalConfidence += word.confidence;
            wordCount++;
          }
        }
      }
    }
  }

  return wordCount > 0 ? totalConfidence / wordCount : undefined;
}

function rebuildTextFromAnnotation(fullTextAnnotation: any): string {
  if (!fullTextAnnotation?.pages) {
    return '';
  }

  const parts: string[] = [];

  for (const page of fullTextAnnotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          for (const symbol of word.symbols || []) {
            if (symbol?.text) {
              parts.push(symbol.text);
            }

            const detectedBreak = getDetectedBreak(symbol);
            if (detectedBreak) {
              appendBreak(parts, detectedBreak);
            }
          }
        }

        appendBreak(parts, '\n');
      }
    }

    appendBreak(parts, '\n');
  }

  const joined = parts.join('');
  return joined
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function appendBreak(parts: string[], breakChar: string): void {
  if (!breakChar) {
    return;
  }

  if (breakChar === ' ') {
    const last = parts[parts.length - 1] ?? '';
    if (!last || last === ' ' || last === '\n') {
      return;
    }
    parts.push(' ');
    return;
  }

  if (breakChar === '\n') {
    while (parts.length > 0 && parts[parts.length - 1] === ' ') {
      parts.pop();
    }

    if (parts[parts.length - 1] === '\n') {
      return;
    }

    parts.push('\n');
    return;
  }

  parts.push(breakChar);
}

function getDetectedBreak(symbol: any): string | undefined {
  const breakType: string | undefined = symbol?.property?.detectedBreak?.type;

  switch (breakType) {
    case 'SPACE':
    case 'SURE_SPACE':
      return ' ';
    case 'EOL_SURE_SPACE':
    case 'LINE_BREAK':
      return '\n';
    case 'HYPHEN':
      return '-';
    default:
      return undefined;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const chunkSize = 8192;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
}

export function validateExtraction(result: ExtractionResult): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (result.pages.length === 0) {
    issues.push('No pages extracted');
    return { isValid: false, issues };
  }

  const totalText = result.pages.map(p => p.text).join(' ');
  if (totalText.trim().length < 100) {
    issues.push('Very little text extracted (< 100 characters)');
  }

  const hasNumbers = /\d/.test(totalText);
  const hasLetters = /[a-zA-Z]{3,}/.test(totalText);

  if (!hasNumbers || !hasLetters) {
    issues.push('Extracted text lacks expected content patterns');
  }

  const lowConfidencePages = result.pages.filter(
    p => p.confidence !== undefined && p.confidence < 0.6
  );

  if (lowConfidencePages.length > 0) {
    issues.push(`${lowConfidencePages.length} page(s) with low OCR confidence`);
  }

  return {
    isValid: issues.length === 0,
    issues: [...issues, ...result.warnings]
  };
}
