export interface ArticleSection {
  title: string;
  content: string;
  highlight?: string;
  englishTerms?: string[];
  suggestedFigureLocation?: string; // e.g. "Page 3"
}

export interface GeneratedArticle {
  title: string;
  coverImagePrompt?: string;
  summary: string;
  sections: ArticleSection[];
  meta: {
    authors: string;
    journal?: string;
    year?: string;
    link?: string;
  };
}

export enum ProcessingState {
  IDLE = 'IDLE',
  READING = 'READING',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export enum ImageGenerationState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}
