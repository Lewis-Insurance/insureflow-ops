import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      throw new Error('No file provided');
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse PDF using pdfjs-dist (works in Deno Edge runtime)
    const pdfjs = await import('https://esm.sh/pdfjs-dist@4.7.76/legacy/build/pdf.mjs');
    // Disable worker usage in Edge runtime
    pdfjs.GlobalWorkerOptions.workerSrc = '';
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), disableFontFace: true });
    const pdfDoc = await loadingTask.promise;

    let text = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = (content.items as any[]).map((item: any) => item.str || '').join(' ');
      text += pageText + '\n\n';
    }
    
    // Parse the text into knowledge base entries
    // Split by common FAQ patterns (Q&A format)
    const entries = [];
    
    // Try to detect Q&A patterns
    const qaPattern = /(?:Question|Q)[\s:]+(.+?)(?:\n|\r\n)(?:Answer|A)[\s:]+(.+?)(?=(?:Question|Q)[\s:]|$)/gis;
    const matches = [...text.matchAll(qaPattern)];
    
    if (matches.length > 0) {
      // Q&A format detected
      matches.forEach((match, index) => {
        entries.push({
          title: match[1].trim(),
          content: match[2].trim(),
          category: 'faq',
          source: file.name,
          tags: ['pdf-import', 'florida-insurance']
        });
      });
    } else {
      // Try splitting by headings/sections
      const sections = text.split(/\n\n+/);
      let currentTitle = 'General Information';
      
      sections.forEach((section, index) => {
        const lines = section.trim().split('\n');
        if (lines.length > 0) {
          // First line as title if it looks like a heading
          const firstLine = lines[0].trim();
          if (firstLine.length < 100 && !firstLine.endsWith('.')) {
            currentTitle = firstLine;
            if (lines.length > 1) {
              entries.push({
                title: currentTitle,
                content: lines.slice(1).join('\n').trim(),
                category: 'information',
                source: file.name,
                tags: ['pdf-import', 'florida-insurance']
              });
            }
          } else {
            entries.push({
              title: currentTitle + ` - Part ${index + 1}`,
              content: section.trim(),
              category: 'information',
              source: file.name,
              tags: ['pdf-import', 'florida-insurance']
            });
          }
        }
      });
    }

    // Filter out very short entries
    const validEntries = entries.filter(entry => 
      entry.content.length > 50 && entry.title.length > 3
    );

    console.log(`Extracted ${validEntries.length} knowledge entries from PDF`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        entries: validEntries,
        totalPages: pdfDoc.numPages,
        extractedText: text.substring(0, 500) // Preview
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error parsing PDF:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});