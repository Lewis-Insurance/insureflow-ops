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

  const fullTextAnnotation = result.responses?.[0]?.fullTextAnnotation;
  const text = fullTextAnnotation?.text || '';
  
  if (!text || text.trim().length < 50) {
    warnings.push('Very little text detected in image');
  }

  console.log(`✓ Image OCR complete: ${text.length} characters extracted`);

  return {
    pages: [{
      page: 1,
      text: text.trim(),
      confidence: calculateAverageConfidence(fullTextAnnotation)
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
  
  console.log(`Processing PDF: ${sizeMB.toFixed(2)} MB`);

  if (fileSize < 10 * 1024 * 1024) {
    return await extractPdfSynchronous(pdfData, apiKey, maxPages, warnings);
  } else {
    warnings.push('PDF is large (>10MB), processing may be slower');
    return await extractPdfSynchronous(pdfData, apiKey, maxPages, warnings);
  }
}

async function extractPdfSynchronous(
  pdfData: Blob,
  apiKey: string,
  maxPages: number,
  warnings: string[]
): Promise<ExtractionResult> {
  
  const base64Pdf = await blobToBase64(pdfData);

  const response = await fetch(
    `https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          inputConfig: {
            content: base64Pdf,
            mimeType: 'application/pdf'
          },
          features: [
            { 
              type: 'DOCUMENT_TEXT_DETECTION'
            }
          ],
          pages: maxPages ? Array.from({ length: maxPages }, (_, i) => i + 1) : undefined
        }]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Vision API error:', response.status, errorText);
    
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        throw new Error(`Vision API: ${errorJson.error.message}`);
      }
    } catch {
      // Use generic error
    }
    
    throw new Error(`Vision API error: ${response.status}`);
  }

  const result = await response.json();

  if (result.responses?.[0]?.error) {
    throw new Error(`Vision API error: ${result.responses[0].error.message}`);
  }

  const pages: PageResult[] = [];
  const responses = result.responses || [];

  for (let i = 0; i < responses.length; i++) {
    const pageResponse = responses[i];
    
    if (pageResponse.error) {
      warnings.push(`Page ${i + 1} error: ${pageResponse.error.message}`);
      continue;
    }

    const fullTextAnnotation = pageResponse.fullTextAnnotation;
    const text = fullTextAnnotation?.text || '';
    
    if (text.trim().length < 20) {
      warnings.push(`Page ${i + 1} has very little text`);
    }

    pages.push({
      page: i + 1,
      text: text.trim(),
      confidence: calculateAverageConfidence(fullTextAnnotation)
    });
  }

  if (pages.length === 0) {
    warnings.push('No text could be extracted from PDF');
    pages.push({
      page: 1,
      text: '[No text extracted]'
    });
  }

  const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
  const avgConfidence = pages.reduce((sum, p) => sum + (p.confidence || 0), 0) / pages.length;
  
  console.log(`✓ PDF OCR complete: ${pages.length} pages, ${totalChars} characters, avg confidence: ${(avgConfidence * 100).toFixed(1)}%`);

  if (avgConfidence < 0.7) {
    warnings.push(`Low OCR confidence (${(avgConfidence * 100).toFixed(1)}%)`);
  }

  return {
    pages,
    warnings
  };
}

function calculateAverageConfidence(fullTextAnnotation: any): number {
  if (!fullTextAnnotation?.pages) {
    return 0;
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

  return wordCount > 0 ? totalConfidence / wordCount : 0;
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
