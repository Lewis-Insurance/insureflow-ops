import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getDocument } from 'npm:pdfjs-serverless@0.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper Functions
function chunkContent(text: string, maxChunkSize: number = 1000): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks;
}

function detectLanguage(text: string): string {
  const spanishIndicators = /\b(de|la|el|que|en|por|para|con|sin)\b/gi;
  const spanishMatches = (text.match(spanishIndicators) || []).length;
  const wordCount = text.split(/\s+/).length;
  
  return (spanishMatches / wordCount) > 0.15 ? 'spanish' : 'english';
}

function removeDuplicates(entries: any[]): any[] {
  const seen = new Set();
  return entries.filter(entry => {
    const hash = `${entry.title}:${entry.content.substring(0, 100)}`;
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
}

function calculateConfidence(entry: any): number {
  let score = 0.5;
  if (entry.category === 'faq') score += 0.2;
  if (entry.content.length > 200) score += 0.1;
  if (entry.content.length > 500) score += 0.1;
  if (/[.!?]$/.test(entry.content)) score += 0.1;
  return Math.min(score, 1.0);
}

function extractReferences(text: string): string[] {
  const patterns = [
    /see\s+(?:section|page|appendix)\s+(\w+)/gi,
    /refer\s+to\s+(\w+(?:\s+\w+)?)/gi,
    /as\s+defined\s+in\s+(\w+(?:\s+\w+)?)/gi,
  ];
  
  const refs = new Set<string>();
  patterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => refs.add(match[1]));
  });
  
  return Array.from(refs);
}

function detectCategory(content: string): string {
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('policy') || lowerContent.includes('coverage')) return 'policy';
  if (lowerContent.includes('claim') || lowerContent.includes('damage')) return 'claims';
  if (lowerContent.includes('premium') || lowerContent.includes('payment')) return 'billing';
  if (lowerContent.includes('question') || lowerContent.includes('answer')) return 'faq';
  return 'information';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const metrics = {
    parseTime: 0,
    extractionTime: 0,
    processingTime: 0,
    totalTime: 0
  };

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    // Parse optional parameters
    const options = {
      chunkSize: parseInt(formData.get('chunkSize') as string) || 1000,
      minContentLength: parseInt(formData.get('minContentLength') as string) || 50,
      includeReferences: formData.get('includeReferences') !== 'false',
      includeConfidence: formData.get('includeConfidence') !== 'false',
      maxEntries: parseInt(formData.get('maxEntries') as string) || -1
    };
    
    // Validate file presence
    if (!file) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No file provided',
          code: 'MISSING_FILE'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid file type. Only PDF files are accepted.',
          code: 'INVALID_FILE_TYPE'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'File too large. Maximum size is 10MB.',
          code: 'FILE_TOO_LARGE'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 413 }
      );
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Parse PDF using pdfjs-serverless
    const pdfDoc = await getDocument({
      data: uint8Array,
      useSystemFonts: true
    }).promise;
    
    // Check if PDF has extractable pages
    if (pdfDoc.numPages === 0) {
      throw new Error('PDF appears to be empty');
    }
    
    metrics.parseTime = Date.now() - startTime;

    // Extract metadata
    const metadata = await pdfDoc.getMetadata();
    const pdfInfo = {
      title: metadata?.info?.Title || file.name,
      author: metadata?.info?.Author || 'Unknown',
      subject: metadata?.info?.Subject || '',
      keywords: metadata?.info?.Keywords || '',
    };

    // Extract text from all pages
    let text = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      
      // Process text items
      const pageText = content.items
        .map((item: any) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      text += pageText + '\n\n';
    }
    
    metrics.extractionTime = Date.now() - startTime - metrics.parseTime;
    
    // Check if we got meaningful text
    if (text.trim().length < 100) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'PDF appears to be scanned or contains no extractable text. OCR may be required.',
          code: 'NO_TEXT_CONTENT',
          metadata: pdfInfo
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 }
      );
    }
    
    // Detect language
    const language = detectLanguage(text);
    
    // Parse the text into knowledge base entries
    const entries = [];
    
    // Try multiple Q&A patterns
    const qaPatterns = [
      /(?:Question|Q|FAQ)[\s:]+(.+?)(?:\n|\r\n)(?:Answer|A|Response)[\s:]+(.+?)(?=(?:Question|Q|FAQ)[\s:]|$)/gis,
      /^\d+\.\s*(.+?)\n+(.+?)(?=^\d+\.|$)/gms,
      /^[•·▪︎]\s*(.+?)\n+(.+?)(?=^[•·▪︎]|$)/gms,
    ];
    
    let matches: RegExpMatchArray[] = [];
    for (const pattern of qaPatterns) {
      matches = [...text.matchAll(pattern)];
      if (matches.length > 0) break;
    }
    
    if (matches.length > 0) {
      // Q&A format detected
      matches.forEach((match) => {
        const title = match[1].trim();
        const content = match[2].trim();
        const references = extractReferences(content);
        
        entries.push({
          title,
          content,
          category: detectCategory(content),
          source: file.name,
          tags: ['pdf-import', 'florida-insurance'],
          language,
          references: references.length > 0 ? references : undefined,
          confidence: 0
        });
      });
    } else {
      // Split by sections
      const sections = text.split(/\n\n+/);
      let currentTitle = 'General Information';
      
      sections.forEach((section, index) => {
        const lines = section.trim().split('\n');
        if (lines.length > 0) {
          const firstLine = lines[0].trim();
          if (firstLine.length < 100 && !firstLine.endsWith('.')) {
            currentTitle = firstLine;
            if (lines.length > 1) {
              const entryContent = lines.slice(1).join('\n').trim();
              const references = extractReferences(entryContent);
              
              entries.push({
                title: currentTitle,
                content: entryContent,
                category: detectCategory(entryContent),
                source: file.name,
                tags: ['pdf-import', 'florida-insurance'],
                language,
                references: references.length > 0 ? references : undefined,
                confidence: 0
              });
            }
          } else {
            const entryContent = section.trim();
            const references = extractReferences(entryContent);
            
            entries.push({
              title: currentTitle + ` - Part ${index + 1}`,
              content: entryContent,
              category: detectCategory(entryContent),
              source: file.name,
              tags: ['pdf-import', 'florida-insurance'],
              language,
              references: references.length > 0 ? references : undefined,
              confidence: 0
            });
          }
        }
      });
    }

    // Process entries
    const uniqueEntries = removeDuplicates(entries);
    
    // Apply chunking for large entries
    const chunkedEntries: any[] = [];
    uniqueEntries.forEach(entry => {
      if (entry.content.length > 1500) {
        const chunks = chunkContent(entry.content, options.chunkSize);
        chunks.forEach((chunk, idx) => {
          chunkedEntries.push({
            ...entry,
            title: chunks.length > 1 ? `${entry.title} (Part ${idx + 1}/${chunks.length})` : entry.title,
            content: chunk,
            chunkIndex: idx,
            totalChunks: chunks.length
          });
        });
      } else {
        chunkedEntries.push(entry);
      }
    });
    
    // Filter and process
    let validEntries = chunkedEntries.filter(entry => 
      entry.content.length > options.minContentLength && entry.title.length > 3
    );
    
    // Calculate confidence scores
    validEntries.forEach(entry => {
      entry.confidence = calculateConfidence(entry);
    });
    
    // Sort by confidence
    validEntries.sort((a, b) => b.confidence - a.confidence);
    
    // Apply max entries limit
    if (options.maxEntries > 0) {
      validEntries = validEntries.slice(0, options.maxEntries);
    }
    
    // Calculate statistics
    const stats = {
      totalEntries: validEntries.length,
      byCategory: validEntries.reduce((acc, entry) => {
        acc[entry.category] = (acc[entry.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byLanguage: {
        english: validEntries.filter(e => e.language === 'english').length,
        spanish: validEntries.filter(e => e.language === 'spanish').length
      },
      averageConfidence: validEntries.length > 0 
        ? validEntries.reduce((sum, e) => sum + e.confidence, 0) / validEntries.length 
        : 0,
      totalReferences: validEntries.reduce((sum, e) => sum + (e.references?.length || 0), 0),
      averageContentLength: validEntries.length > 0
        ? Math.round(validEntries.reduce((sum, e) => sum + e.content.length, 0) / validEntries.length)
        : 0
    };
    
    metrics.processingTime = Date.now() - startTime - metrics.parseTime - metrics.extractionTime;
    metrics.totalTime = Date.now() - startTime;

    console.log(`Extracted ${validEntries.length} knowledge entries from PDF in ${metrics.totalTime}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        entries: validEntries,
        totalPages: pdfDoc.numPages,
        metadata: pdfInfo,
        language,
        metrics,
        stats,
        extractedText: text.length <= 1000000 ? text.substring(0, 500) : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error parsing PDF:', error);
    
    if (error.message?.includes('password')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'PDF is password protected',
          code: 'PASSWORD_PROTECTED'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }
    
    if (error.message?.includes('Invalid PDF')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid or corrupted PDF file',
          code: 'INVALID_PDF'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to parse PDF',
        code: 'PARSE_ERROR'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
