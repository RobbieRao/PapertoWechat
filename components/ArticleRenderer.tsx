import React, { useRef, useState, useImperativeHandle, forwardRef, useEffect } from 'react';
import { GeneratedArticle } from '../types';
import { ExtractedImage } from '../utils/pdfUtils';

export interface ArticleRendererHandle {
  insertImage: (image: ExtractedImage) => void;
}

interface ArticleRendererProps {
  article: GeneratedArticle;
  coverImageUrl?: string;
  extractedImages: ExtractedImage[]; // Passed down to allow auto-matching
  onCopy: () => void;
}

const ArticleRenderer = forwardRef<ArticleRendererHandle, ArticleRendererProps>(({ article, coverImageUrl, extractedImages, onCopy }, ref) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const lastRangeRef = useRef<Range | null>(null);

  // Expose manual insert
  useImperativeHandle(ref, () => ({
    insertImage: (image: ExtractedImage) => {
      insertImageAtCursor(image);
    }
  }));

  const insertImageAtCursor = (image: ExtractedImage) => {
      const container = contentRef.current;
      if (!container) return;
      container.focus();

      let range = lastRangeRef.current;
      const selection = window.getSelection();
      
      if (selection && selection.rangeCount > 0 && container.contains(selection.anchorNode)) {
        range = selection.getRangeAt(0);
      }
      if (!range) {
         range = document.createRange();
         range.selectNodeContents(container);
         range.collapse(false);
      }

      const wrapper = createImageNode(image);
      
      range.deleteContents();
      range.insertNode(wrapper);
      range.collapse(false);
      
      if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
      }
      lastRangeRef.current = range;
  };

  const createImageNode = (image: ExtractedImage) => {
      const wrapper = document.createElement('div');
      wrapper.contentEditable = "false"; // Treat as a block
      wrapper.style.margin = '24px 0';
      wrapper.style.textAlign = 'center';
      
      const img = document.createElement('img');
      img.src = image.src;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '6px';
      img.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      img.style.border = '1px solid #f0f0f0';
      img.style.display = 'inline-block';
      
      const caption = document.createElement('div');
      caption.innerText = `▼ ${image.label}`;
      caption.style.fontSize = '13px';
      caption.style.color = '#888';
      caption.style.marginTop = '8px';
      caption.style.fontFamily = 'Helvetica, Arial, sans-serif';
      
      wrapper.appendChild(img);
      wrapper.appendChild(caption);
      return wrapper;
  };

  const handleSelectionChange = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && contentRef.current?.contains(selection.anchorNode)) {
      lastRangeRef.current = selection.getRangeAt(0);
    }
  };

  const handleCopy = () => {
    if (contentRef.current) {
      const content = contentRef.current.innerHTML;
      const blob = new Blob([content], { type: 'text/html' });
      const plainText = contentRef.current.innerText;
      const plainBlob = new Blob([plainText], { type: 'text/plain' });
      
      const item = new ClipboardItem({
        'text/html': blob,
        'text/plain': plainBlob,
      });

      navigator.clipboard.write([item]).then(() => {
        setCopyFeedback(true);
        onCopy();
        setTimeout(() => setCopyFeedback(false), 2000);
      });
    }
  };

  // Helper to parse **bold** text
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-gray-900 mx-1">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Helper to find matching image
  const getMatchingFigure = (label: string | undefined) => {
      if (!label) return null;
      // Normalize: "Figure 1" -> "figure 1"
      const normalized = label.toLowerCase().replace('.', '').trim();
      return extractedImages.find(img => 
          img.label.toLowerCase().includes(normalized) || 
          normalized.includes(img.label.toLowerCase())
      );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 px-2">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
            Preview & Edit <span className="text-xs font-normal text-gray-400 ml-2">(Click anywhere to edit)</span>
        </h2>
        <button
          onClick={handleCopy}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2 ${
            copyFeedback 
              ? 'bg-green-100 text-green-700 ring-2 ring-green-500' 
              : 'bg-wechat-primary text-white hover:bg-green-600 shadow-md hover:shadow-lg'
          }`}
        >
          {copyFeedback ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              已复制 (Copied)
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
              复制全文
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-100 p-4 md:p-8 rounded-xl border border-gray-200 shadow-inner">
        <div 
          ref={contentRef}
          contentEditable={true}
          suppressContentEditableWarning={true}
          onMouseUp={handleSelectionChange}
          onKeyUp={handleSelectionChange}
          onBlur={handleSelectionChange}
          className="mx-auto max-w-[500px] bg-white min-h-[800px] shadow-sm text-[#333333] font-sans leading-relaxed outline-none focus:ring-2 focus:ring-green-100 focus:ring-offset-2 transition-shadow"
          style={{ padding: '20px' }}
        >
          {/* Header */}
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '10px', lineHeight: '1.4' }}>
            {article.title}
          </h1>
          
          <div style={{ fontSize: '14px', color: '#888888', marginBottom: '20px' }}>
            <span>{article.meta.authors.split(',')[0]} 等</span>
            <span style={{ marginLeft: '10px', color: '#576b95' }}>{article.meta.journal || '学术前沿'}</span>
          </div>

          {/* Cover Image */}
          {coverImageUrl ? (
             <img src={coverImageUrl} alt="Cover" style={{ width: '100%', borderRadius: '8px', marginBottom: '24px', display: 'block' }} />
          ) : (
            <div style={{ 
              width: '100%', 
              height: '200px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginBottom: '24px',
              color: '#999',
              border: '1px dashed #ddd',
              fontSize: '14px'
            }}>
              [Cover Image Placeholder]
            </div>
          )}

          {/* Summary Box */}
          <section style={{ 
            backgroundColor: '#f7f7f7', 
            padding: '16px', 
            borderRadius: '6px', 
            marginBottom: '32px',
            fontSize: '15px',
            borderLeft: '4px solid #07C160'
          }}>
            <p style={{ margin: 0 }}><strong>摘要：</strong>{article.summary}</p>
          </section>

          {/* Dynamic Sections */}
          {article.sections.map((section, idx) => {
            const matchingFig = getMatchingFigure(section.suggestedFigureLocation);

            return (
                <div key={idx} style={{ marginBottom: '40px' }}>
                {/* Section Header */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ 
                    fontSize: '36px', 
                    fontWeight: '900', 
                    color: '#eeeeee', 
                    marginRight: '-10px',
                    zIndex: 0,
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    userSelect: 'none'
                    }} contentEditable={false}>
                    {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h2 style={{ 
                    fontSize: '18px', 
                    fontWeight: 'bold', 
                    borderBottom: '2px solid #07C160', 
                    paddingBottom: '4px',
                    zIndex: 1,
                    margin: 0,
                    paddingLeft: '12px'
                    }}>
                    {section.title.replace(/^\d+\s*/, '')}
                    </h2>
                </div>

                {/* English Terms Tags */}
                {section.englishTerms && section.englishTerms.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                    {section.englishTerms.map((term, tIdx) => (
                        <span key={tIdx} style={{ 
                        display: 'inline-block', 
                        backgroundColor: '#e6f7ef', 
                        color: '#07C160', 
                        fontSize: '12px', 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        marginRight: '6px',
                        marginBottom: '4px'
                        }}>
                        {term}
                        </span>
                    ))}
                    </div>
                )}

                {/* Content */}
                <div style={{ fontSize: '16px', lineHeight: '1.8', textAlign: 'justify' }}>
                    {section.content.split('\n').map((para, pIdx) => (
                        para.trim() ? <p key={pIdx} style={{ marginBottom: '16px' }}>{renderFormattedText(para)}</p> : null
                    ))}
                </div>

                {/* AUTOMATIC FIGURE INSERTION */}
                {matchingFig && (
                    <div contentEditable={false} style={{ margin: '20px 0', textAlign: 'center' }}>
                        <img 
                            src={matchingFig.src} 
                            style={{ 
                                maxWidth: '100%', 
                                borderRadius: '6px', 
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                border: '1px solid #f0f0f0' 
                            }} 
                        />
                        <div style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>
                             ▼ {matchingFig.label}
                        </div>
                    </div>
                )}

                {/* Highlight / Key Takeaway */}
                {section.highlight && (
                    <div style={{ 
                    marginTop: '16px', 
                    padding: '12px', 
                    border: '1px dashed #576b95', 
                    borderRadius: '6px',
                    color: '#576b95',
                    fontSize: '14px',
                    backgroundColor: '#f4f6f9'
                    }}>
                    <strong>💡 创新点与思考：</strong> {renderFormattedText(section.highlight)}
                    </div>
                )}
                </div>
            );
          })}

          {/* Footer / Disclaimer */}
          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '40px 0 20px 0' }} />
          
          <div style={{ fontSize: '13px', color: '#888', lineHeight: '1.6', backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
            <p style={{ marginBottom: '8px' }}>
              <strong>原文标题：</strong> {article.title}
            </p>
            <p style={{ marginBottom: '8px' }}>
              <strong>作者单位：</strong> {article.meta.authors}
            </p>
            {article.meta.link && (
               <p style={{ marginBottom: '8px', wordBreak: 'break-all' }}>
                 <strong>原文链接：</strong> {article.meta.link}
               </p>
            )}
            <p style={{ marginTop: '16px', fontStyle: 'italic' }}>
              本文仅为笔者对论文内容的理解，不代表原论文的官方观点，转载请注明出处。
            </p>
          </div>

        </div>
      </div>
    </div>
  );
});

ArticleRenderer.displayName = 'ArticleRenderer';

export default ArticleRenderer;
