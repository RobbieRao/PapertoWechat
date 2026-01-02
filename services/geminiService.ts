import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedArticle } from "../types";

// Helper to initialize the client securely
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateArticleFromPdf = async (
  base64Pdf: string,
  onProgress: (status: string) => void
): Promise<GeneratedArticle> => {
  const ai = getAiClient();
  
  onProgress("Deep reading with Gemini 3 Pro (Academic Mode)...");

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { 
        type: Type.STRING, 
        description: "Strict format: '文献分享 | [Conference/Journal Name] [Chinese Translation of Paper Title]'. Example: '文献分享 | CVPR 2024 基于扩散模型的高效图像生成'. If Conference is unknown, use '学术前沿'." 
      },
      summary: { type: Type.STRING, description: "Academic abstract style summary. Concise, objective, focusing strictly on the research gap, method, and results. No marketing fluff." },
      coverImagePrompt: { type: Type.STRING, description: "Abstract art description for cover. STRICTLY NO TEXT descriptions." },
      sections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Section title (e.g. '01 研究背景', '02 研究方法')." },
            content: { type: Type.STRING, description: "Rigorous academic text. Use **bold** for key metrics/terms. Tone should be calm and objective." },
            highlight: { type: Type.STRING, description: "Key academic contribution or insight." },
            englishTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedFigureLocation: { type: Type.STRING, description: "Exact label of the figure relevant here, e.g., 'Figure 1', 'Figure 3'. If none, empty string." }
          },
          required: ["title", "content"]
        }
      },
      meta: {
        type: Type.OBJECT,
        properties: {
          authors: { type: Type.STRING },
          journal: { type: Type.STRING },
          year: { type: Type.STRING },
          link: { type: Type.STRING }
        },
        required: ["authors"]
      }
    },
    required: ["title", "sections", "meta", "summary"]
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Pdf
            }
          },
          {
            text: `
              You are a Senior Academic Researcher and Editor for a scholarly journal. Your audience consists of PhD students and professors.
              
              **Task**: Generate a rigorous, objective academic analysis of this paper.
              
              **Tone & Style Rules (CRITICAL)**:
              1.  **Calm & Objective**: Absolutely NO marketing hype, clickbait, or emotional adjectives (e.g., avoid "shocking", "game-changing", "magic", "unbelievable"). 
              2.  **Scholarly Voice**: Use precise, neutral academic language. Focus on "The authors propose...", "This study demonstrates...", "The results indicate...".
              3.  **Data-Driven**: Always prioritize specific numbers, p-values, and architectural details over general statements.
              
              **Structure Guidelines**:
              1.  **Title**: MUST strictly follow the format: "文献分享 | [Conference/Journal Name] [Chinese Translated Title]". 
              2.  **Section 1: Research Background (研究背景)**: Objectively state the academic problem, context, and limitations of prior work (SOTA).
              3.  **Section 2: Methodology (研究方法)**: Technically describe the proposed approach. Use specific terms (e.g., specific loss functions, module names).
              4.  **Section 3: Experiments (主要实验结果)**: Report key metrics and comparisons objectively.
              5.  **Section 4: Innovation & Implications (创新点与启示)**: Summarize the core academic contributions and future research directions.
              
              **Formatting**:
              *   Use **bold** for key terms or numbers.
              *   Identify where "Figure 1", "Figure 2", etc., should be placed.
              *   Language: Simplified Chinese (简体中文). Keep specific technical terms in English (e.g., Transformer, Zero-shot) for clarity.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        thinkingConfig: { thinkingBudget: 16000 }
      }
    });

    if (!response.text) {
      throw new Error("No response generated");
    }

    return JSON.parse(response.text) as GeneratedArticle;

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};

export const generateCoverImage = async (prompt: string, size: "1K" | "2K" | "4K" = "1K"): Promise<string> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: `
          Create a high-end, abstract, scientific illustration for a magazine cover.
          Subject: ${prompt}
          Style: 3D render, ethereal, glassmorphism, data visualization aesthetic, cinematic lighting.
          
          NEGATIVE PROMPT (Forbidden): text, letters, words, typography, journal names, watermark, signature, blurry, messy, distorted.
          
          Ensure the image is completely text-free.
        ` }]
      },
      config: {
        imageConfig: {
            imageSize: size,
            aspectRatio: "16:9"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data found in response");
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};
