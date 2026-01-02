import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { generateArticleFromPdf, generateCoverImage } from './services/geminiService';
import { fileToBase64 } from './utils/fileUtils';
import { extractImagesFromPdf, ExtractedImage } from './utils/pdfUtils';
import ArticleRenderer, { ArticleRendererHandle } from './components/ArticleRenderer';
import { GeneratedArticle, ProcessingState, ImageGenerationState } from './types';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingState>(ProcessingState.IDLE);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [article, setArticle] = useState<GeneratedArticle | null>(null);
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
  
  // Image Gen State
  const [imgGenStatus, setImgGenStatus] = useState<ImageGenerationState>(ImageGenerationState.IDLE);
  const [coverImageUrl, setCoverImageUrl] = useState<string | undefined>(undefined);
  const [imgSize, setImgSize] = useState<"1K" | "2K" | "4K">("1K");
  const [editablePrompt, setEditablePrompt] = useState<string>("");

  // Ref to access the renderer
  const rendererRef = useRef<ArticleRendererHandle>(null);

  // Update editable prompt when article changes
  useEffect(() => {
    if (article?.coverImagePrompt) {
      setEditablePrompt(article.coverImagePrompt);
    }
  }, [article]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus(ProcessingState.IDLE);
      setArticle(null);
      setCoverImageUrl(undefined);
      setExtractedImages([]);
      setEditablePrompt("");
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    try {
      setStatus(ProcessingState.READING);
      
      // 1. Extract Images first
      setStatusMessage("Scanning PDF for Figures (Figure 1, Figure 2...)...");
      try {
        const images = await extractImagesFromPdf(file);
        console.log("Extracted images:", images);
        setExtractedImages(images);
        if (images.length === 0) {
            setStatusMessage("No captions found (e.g. 'Figure 1'). Proceeding with text only...");
            await new Promise(r => setTimeout(r, 1000));
        } else {
             setStatusMessage(`Found ${images.length} figures! Analyzing text...`);
        }
      } catch (err) {
        console.warn("Figure extraction failed", err);
        setStatusMessage("Figure extraction skipped due to error. Analyzing text...");
      }
      
      // 2. Read file for Gemini
      const base64 = await fileToBase64(file);
      
      setStatus(ProcessingState.GENERATING);
      
      const result = await generateArticleFromPdf(base64, (msg) => setStatusMessage(msg));
      
      setArticle(result);
      setStatus(ProcessingState.COMPLETE);
    } catch (error) {
      console.error(error);
      setStatus(ProcessingState.ERROR);
      setStatusMessage("Failed to process PDF. Please try again.");
    }
  };

  const handleGenerateImage = async () => {
    if (!editablePrompt) return;
    
    try {
      setImgGenStatus(ImageGenerationState.GENERATING);
      const url = await generateCoverImage(editablePrompt, imgSize);
      setCoverImageUrl(url);
      setImgGenStatus(ImageGenerationState.COMPLETE);
    } catch (e) {
      console.error(e);
      setImgGenStatus(ImageGenerationState.ERROR);
    }
  };

  const handleInsertFigure = (img: ExtractedImage) => {
    if (rendererRef.current) {
        rendererRef.current.insertImage(img);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans text-gray-800 bg-slate-50">
      
      {/* Left Panel: Controls */}
      <div className="w-full md:w-1/3 lg:w-1/4 p-6 bg-white border-r border-gray-200 flex flex-col shadow-lg z-10 h-screen overflow-y-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-wechat-primary rounded-lg flex items-center justify-center text-white font-bold text-lg">
              文
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">WeChat Scholar AI</h1>
          </div>
          <p className="text-xs text-gray-500">Transform Papers to Posts Instantly</p>
        </div>

        {/* Upload Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">1. Upload Paper (PDF)</label>
          <div className="relative group">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2.5 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-green-50 file:text-green-700
                hover:file:bg-green-100
                cursor-pointer border border-dashed border-gray-300 rounded-lg p-2
                transition-colors hover:border-green-400
              "
            />
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleProcess}
          disabled={!file || status === ProcessingState.READING || status === ProcessingState.GENERATING}
          className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-white transition-all shadow-md
            ${!file || status !== ProcessingState.IDLE && status !== ProcessingState.COMPLETE && status !== ProcessingState.ERROR
              ? 'bg-gray-300 cursor-not-allowed' 
              : 'bg-gradient-to-r from-wechat-primary to-green-600 hover:shadow-lg hover:scale-[1.02]'
            }
          `}
        >
          {status === ProcessingState.READING || status === ProcessingState.GENERATING ? (
             <>
               <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
               {status === ProcessingState.READING ? 'Reading PDF...' : 'Analyzing...'}
             </>
          ) : (
             <>
               <span className="text-lg">✨</span> Generate
             </>
          )}
        </button>

        {/* Status Messages */}
        {status !== ProcessingState.IDLE && status !== ProcessingState.COMPLETE && (
          <div className="mt-4 p-4 bg-blue-50 text-blue-800 text-xs rounded-lg border border-blue-100 animate-pulse">
            <p className="font-semibold mb-1">Status:</p>
            {statusMessage}
          </div>
        )}

        {status === ProcessingState.ERROR && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            Error processing file. Please ensure it is a valid PDF.
          </div>
        )}

        {/* Extracted Figures List - CLICK TO INSERT */}
        {extractedImages.length > 0 && (
           <div className="mt-6 flex-1 overflow-hidden flex flex-col min-h-[200px]">
             <h3 className="text-sm font-semibold text-gray-700 mb-2 flex justify-between">
                <span>Extracted Figures</span>
                <span className="text-xs text-wechat-primary font-normal">Click to Insert →</span>
             </h3>
             <div className="grid grid-cols-2 gap-2 overflow-y-auto border p-2 rounded bg-gray-50 flex-1">
                {extractedImages.map(img => (
                  <button 
                    key={img.id} 
                    onClick={() => handleInsertFigure(img)}
                    className="group relative bg-white border border-gray-200 rounded hover:border-wechat-primary hover:shadow-md transition-all text-left"
                    title={`Insert ${img.label}`}
                  >
                    <div className="aspect-square w-full p-1 flex items-center justify-center bg-white">
                        <img src={img.src} className="max-w-full max-h-full object-contain" alt={`Page ${img.page}`} />
                    </div>
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 bg-wechat-primary text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">
                            + Insert
                        </span>
                    </div>
                    <div className="p-1 text-[10px] text-gray-500 truncate text-center border-t border-gray-100 bg-gray-50">
                        {img.label} (P{img.page})
                    </div>
                  </button>
                ))}
             </div>
           </div>
        )}

        {/* Image Generation Section */}
        {status === ProcessingState.COMPLETE && article && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">2. Cover Image (AI)</label>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
               
               {/* EDITABLE PROMPT */}
               <div className="mb-3">
                   <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Prompt (Editable):</label>
                   <textarea
                     value={editablePrompt}
                     onChange={(e) => setEditablePrompt(e.target.value)}
                     className="w-full h-24 text-xs p-2 border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none bg-white text-gray-700"
                     placeholder="Describe the cover image..."
                   />
               </div>
               
               <div className="flex items-center gap-2 mb-3">
                 <span className="text-xs text-gray-600">Size:</span>
                 {(['1K', '2K', '4K'] as const).map(s => (
                   <button 
                     key={s}
                     onClick={() => setImgSize(s)}
                     className={`text-xs px-2 py-1 rounded border ${imgSize === s ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
                   >
                     {s}
                   </button>
                 ))}
               </div>

               <button
                 onClick={handleGenerateImage}
                 disabled={imgGenStatus === ImageGenerationState.GENERATING || !editablePrompt}
                 className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
               >
                 {imgGenStatus === ImageGenerationState.GENERATING ? 'Generating...' : 'Generate with Gemini 3 Pro'}
               </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Output */}
      <div className="flex-1 bg-slate-100 relative h-screen overflow-hidden">
        {article ? (
          <div className="h-full p-4 md:p-8">
            <ArticleRenderer 
              ref={rendererRef}
              article={article} 
              coverImageUrl={coverImageUrl}
              extractedImages={extractedImages}
              onCopy={() => {}}
            />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-white border-4 border-dashed border-gray-200 flex items-center justify-center">
               <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
            <h3 className="text-lg font-medium text-gray-600 mb-2">Ready to Transform</h3>
            <p className="max-w-md">Upload a PDF academic paper to generate a professionally formatted WeChat Official Account article.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;