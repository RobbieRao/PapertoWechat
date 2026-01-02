import * as pdfjsLib from 'pdfjs-dist';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

export interface ExtractedImage {
  id: string;
  label: string; // e.g. "Figure 1"
  src: string;
  page: number;
}

interface TextItemPosition {
  str: string;
  x: number;
  y: number; // Viewport Y (top)
  bottom: number; // Viewport Y (bottom/baseline)
  width: number;
  height: number;
  right: number;
}

export const extractImagesFromPdf = async (file: File): Promise<ExtractedImage[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const extractedFigures: ExtractedImage[] = [];

  console.log(`PDF Loaded: ${pdf.numPages} pages`);

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 2.0 });

      // 1. Map items to Viewport
      const items: TextItemPosition[] = textContent.items
        .map((item: any) => {
           // Use viewport conversion method which is robust against transforms/rotation
           // item.transform[4] is x, item.transform[5] is y in PDF space
           const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
           
           // item.width/height are in PDF space. Scale them.
           const w = item.width * viewport.scale;
           // item.height in textContent is roughly font size
           const h = Math.abs(item.height * viewport.scale) || 10;

           // vy is usually the baseline in viewport coordinates.
           // To get "top", we subtract height.
           
           return {
             str: item.str,
             x: vx,
             y: vy - h, // Top
             bottom: vy, // Baseline/Bottom
             width: w,
             height: h,
             right: vx + w
           };
        })
        // Filter out empty or whitespace-only items to avoid noise
        .filter(i => i.str.trim().length > 0);

      // 2. Group into Lines based on Y coordinate
      // Sort by Y first
      items.sort((a, b) => {
        const yDiff = Math.abs(a.bottom - b.bottom);
        if (yDiff < 8) { // Tolerance for same line
           return a.x - b.x;
        }
        return a.bottom - b.bottom;
      });

      const lines: ReturnType<typeof mergeLine>[] = [];
      let currentLine: TextItemPosition[] = [];

      items.forEach((item) => {
        if (currentLine.length === 0) {
          currentLine.push(item);
        } else {
          const last = currentLine[currentLine.length - 1];
          // Check line proximity (vertical)
          if (Math.abs(item.bottom - last.bottom) < 8) {
             currentLine.push(item);
          } else {
             lines.push(mergeLine(currentLine));
             currentLine = [item];
          }
        }
      });
      if (currentLine.length > 0) lines.push(mergeLine(currentLine));

      // 3. Detect Captions
      // Regex allows for "Fig 1", "Figure. 1", "Fig. 1", "Figure 1"
      // Also handles case insensitive
      const captionRegex = /^(Figure|Fig)[\.\s]+(\d+)/i;
      
      const captionLines = lines.filter(l => {
          const match = captionRegex.test(l.text);
          if (match) console.log(`Found Caption Candidate on Page ${pageNum}: "${l.text}"`);
          return match;
      });

      if (captionLines.length === 0) continue;

      // 4. Render Page
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      await page.render({ canvasContext: ctx, viewport } as any).promise;

      // 5. Crop
      for (const caption of captionLines) {
        const match = caption.text.match(captionRegex);
        if (!match) continue;
        const label = `Figure ${match[2]}`; // Standardize to "Figure X"
        
        const cropBottom = caption.y; // Top of the caption text
        
        // Find text content strictly above
        const linesAbove = lines.filter(l => l.bottom < cropBottom && l.bottom > 0);
        linesAbove.sort((a, b) => b.bottom - a.bottom); // Closest first
        
        const nearestLine = linesAbove[0];
        let cropTop = 0;
        
        if (nearestLine) {
           cropTop = nearestLine.bottom + 15; // Padding below previous text
        } else {
           cropTop = Math.max(0, cropBottom - 600); // Fallback if no text above (top of page image)
        }

        // Sanity check: If the detected gap is too small (e.g. false detection or tight spacing)
        // Force a minimum height window to ensure we catch the figure
        if (cropBottom - cropTop < 100) {
            cropTop = Math.max(0, cropBottom - 450);
        }

        let cropHeight = cropBottom - cropTop;
        if (cropHeight <= 0) continue;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = viewport.width;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext('2d');
        
        if (cropCtx) {
           cropCtx.fillStyle = '#ffffff';
           cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
           cropCtx.drawImage(
               canvas,
               0, cropTop, viewport.width, cropHeight,
               0, 0, viewport.width, cropHeight
           );
           
           console.log(`Extracted ${label} from Page ${pageNum}`);
           
           extractedFigures.push({
               id: `${pageNum}-${label}`,
               label: label,
               page: pageNum,
               src: cropCanvas.toDataURL('image/png')
           });
        }
      }

    } catch (e) {
      console.error(`Error processing page ${pageNum}`, e);
    }
  }
  
  return extractedFigures;
};

// Helper: Merges text items into a single line string, fixing fragmented words
function mergeLine(items: TextItemPosition[]) {
  // Sort by X
  items.sort((a,b) => a.x - b.x);
  
  let text = items[0].str;
  for (let i = 1; i < items.length; i++) {
    const prev = items[i-1];
    const curr = items[i];
    
    // Gap check: logic to decide if there is a space
    // If the gap between end of prev and start of curr is "significant", add space.
    // Otherwise assume it is part of the same word (e.g. "F" "i" "g").
    const gap = curr.x - prev.right;
    
    // 5px threshold at scale 2.0 (approx 2.5px in PDF units)
    if (gap > 5) { 
        text += " ";
    }
    text += curr.str;
  }
  
  const y = Math.min(...items.map(i => i.y));
  const bottom = Math.max(...items.map(i => i.bottom));
  
  // Use the first item's x
  const x = items[0].x;
  
  return { text, x, y, bottom, height: bottom - y };
}