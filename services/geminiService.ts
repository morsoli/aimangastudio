import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { GeneratedContent, Character, Page, StorySuggestion, PanelShape, ImageShape, CanvasShape, Pose, AnalysisResult } from '../types';
import { SkeletonPose, SkeletonData } from '../types';

/**
 * Resolve API key at runtime. Priority:
 * 1. Browser localStorage key `gemini_api_key`
 * 2. Environment variables (process.env.GEMINI_API_KEY or process.env.API_KEY)
 */
function getApiKey(): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const stored = localStorage.getItem('gemini_api_key');
            if (stored && stored.trim()) return stored;
        }
    } catch (e) {
        // ignore localStorage access errors (e.g., SSR)
    }

    if (typeof process !== 'undefined' && process.env) {
        const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (envKey && envKey !== '""' && envKey !== 'undefined') return envKey as string;
    }

    return null;
}

function getAiClient(): GoogleGenAI {
    const key = getApiKey();
    if (!key) {
        throw new Error("No Gemini API key found. Please set it in the app (localStorage key 'gemini_api_key') or provide GEMINI_API_KEY / API_KEY in the environment.");
    }
    return new GoogleGenAI({ apiKey: key });
}

function base64ToGeminiPart(base64: string, mimeType: string) {
  return {
    inlineData: {
      data: base64.split(',')[1],
      mimeType,
    },
  };
}

export async function generateWorldview(characters: Character[]): Promise<string> {
    let prompt = `你是一位富有创意的世界观构建者和故事讲述者。根据以下角色列表，为漫画创作一个引人入胜且充满想象力的世界观或背景设定。

**角色：**
${characters.map(c => `- **${c.name}：** ${c.description || '未提供描述。'}`).join('\n')}

**你的任务：**
- 创造一个独特的背景设定（例如奇幻王国、科幻城市、带有转折的现代高中）。
- 简要描述这个世界的关键规则、冲突或谜团。
- 解释这些角色如何融入或与这个世界相关联。
- 语调应该为漫画艺术家提供创意和灵感。
- 以一整段文字的形式提供回应。
`;
    
    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    return response.text;
}


export async function generateDetailedStorySuggestion(
    premise: string,
    worldview: string,
    characters: Character[],
    previousPages?: Pick<Page, 'generatedImage' | 'sceneDescription'>[]
): Promise<StorySuggestion> {
    
    let contextPrompt = "你是一位富有创意的漫画编剧。用户希望获得帮助来编写单页漫画的脚本。";

    if (worldview) {
        contextPrompt += `\n\n**重要世界观背景：**\n${worldview}\n\n这个世界观是故事的基础真理。确保你的建议与这些规则保持一致。`;
    }

    if (characters && characters.length > 0) {
        contextPrompt += "\n\n**角色档案：**\n";
        characters.forEach(char => {
            contextPrompt += `- **${char.name}：** ${char.description || '未提供描述。'}\n`;
        });
        contextPrompt += "将这些角色特质融入他们的动作和对话中。";
    }


    const previousPagesContent: any[] = [];
    if (previousPages && previousPages.length > 0) {
        contextPrompt += "\n\n**前一页背景：**\n这一新页面必须是前一页的直接延续。以下是按时间顺序排列的最近页面的背景：";
        
        previousPages.forEach((page, index) => {
            if (page.generatedImage && page.sceneDescription) {
                contextPrompt += `\n\n**[前一页 ${index + 1}]**\n*脚本：* ${page.sceneDescription}\n*图像：* [图像 ${index + 1} 已附加]`;
                const mimeType = page.generatedImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
                previousPagesContent.push(base64ToGeminiPart(page.generatedImage, mimeType));
            }
        });
    }

    if (premise) {
        contextPrompt += `\n\n**用户对新页面的前提：**\n"${premise}"`;
        contextPrompt += "\n\n**你的任务：**\n基于提供的所有背景（世界观、角色、前一页、用户前提），为此新漫画页面生成详细脚本。";
    } else {
        contextPrompt += "\n\n**你的任务：**\n用户未提供具体前提。基于世界观、角色和前一页的背景，为故事提出一个逻辑且有趣的下一页。为此新漫画页面生成详细脚本。";
    }

    contextPrompt += " 将故事分解为2-4个分镜。为每个分镜提供动作/镜头的简洁描述和任何角色对话。分镜可以描述环境、物体或无需角色的特写，只要服务于故事即可。**重要：所有对话必须使用英文。**";

    const contents = {
        parts: [{ text: contextPrompt }, ...previousPagesContent],
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: {
                        type: Type.STRING,
                        description: "A brief, one-sentence summary of the page's story."
                    },
                    panels: {
                        type: Type.ARRAY,
                        description: "An array of panel objects, describing the scene.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                panel: {
                                    type: Type.INTEGER,
                                    description: "The panel number (e.g., 1, 2, 3)."
                                },
                                description: {
                                    type: Type.STRING,
                                    description: "A description of the visual action, camera angle, character expressions, or environment in the panel."
                                },
                                dialogue: {
                                    type: Type.STRING,
                                    description: "The dialogue spoken by a character in the panel. Format as 'Character Name: \"Line of dialogue\"'. Can be empty."
                                }
                            },
                             required: ["panel", "description"]
                        }
                    }
                },
                required: ["summary", "panels"]
            }
        }
    });

    try {
        const jsonText = response.text;
        const suggestion = JSON.parse(jsonText) as StorySuggestion;
        // Basic validation
        if (suggestion && suggestion.summary && Array.isArray(suggestion.panels)) {
            return suggestion;
        }
        throw new Error("Parsed JSON does not match the expected structure.");
    } catch (e) {
        console.error("Failed to parse story suggestion JSON:", e);
        throw new Error("The AI returned an invalid story structure. Please try again.");
    }
}


const ASPECT_RATIO_CONFIG: { [key: string]: { w: number, h: number, value: string } } = {
    'A4': { w: 595, h: 842, value: '210:297' },
    '竖版': { w: 600, h: 800, value: '3:4' },
    '正方形': { w: 800, h: 800, value: '1:1' },
    '横版': { w: 1280, h: 720, value: '16:9' }
};

export async function generateLayoutProposal(
    story: string,
    characters: Character[],
    aspectRatioKey: string,
    previousPage?: { proposalImage: string, sceneDescription: string },
    currentCanvasImage?: string
): Promise<{ proposalImage: string }> {
    const config = ASPECT_RATIO_CONFIG[aspectRatioKey] || ASPECT_RATIO_CONFIG['A4'];
    const aspectRatioValue = config.value;
    const hasCharacters = characters.length > 0;

    const characterParts = hasCharacters
      ? characters.map(char => {
          const mimeType = char.sheetImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
          return base64ToGeminiPart(char.sheetImage, mimeType);
        })
      : [];
    
    const prompt = `
        你是一位专业的漫画分镜艺术家。你的任务是通过生成单页粗略的灰度素描来为用户提供视觉指导。

        **核心目标：**
        你的主要目标是创建一个动态且视觉上有趣的分镜布局，体现专业漫画分镜技巧。分镜应该引导读者的视线并控制故事节奏。

        **提供的输入：**
        1.  **故事：**单页漫画的简短叙述。
        2.  **画布图像：**这是用户的画布。可能是空白的或包含现有绘图。这是你的绘图表面。
        3.  **角色表：${hasCharacters ? '提供了角色参考表。' : '未提供角色表。'}
        ${previousPage ? '4.  **上一页图像：**前一页的内容，用于参考。' : ''}


        **素描的关键指示：**
        1.  **尺寸和比例：**输出素描必须填满整个画布，并具有精确的${aspectRatioValue}比例。不要留任何空白边距或填充。图像应适当调整为${config.w}像素宽和${config.h}像素高的画布。
        2.  **创意分镜布局：**避免简单、无聊的网格布局。使用专业技术：
            - **动态角度：**使用对角线切割的分镜来表现动作或不安。
            - **重叠和插入分镜：**重叠分镜以显示同时发生的动作，或使用插入分镜来聚焦。
            - **变化的尺寸和形状：**混合使用大分镜和小分镜。使用非矩形形状来匹配场景氛围。
            - **分镜突破：**为了高冲击力，让角色或效果超出分镜边界。
        3.  **画布整合：**提供的"画布图像"是你的绘图表面。如果包含现有用户绘图，你必须将其整合到你的布局中。提出与用户作品互补或完善的新分镜和元素。如果是空白画布，从头开始创建新布局。
        4.  **内容：**
            - **素描，非最终艺术：**使用粗略、简单的线条和基本形状。这是构图指导。
            - **角色姿势：${hasCharacters ? "将角色（使用其参考表作为外观）放置在分镜内。" : "根据故事在分镜内绘制通用角色。"}
            - **无角色分镜：**如果故事描述的分镜只有背景或物体，不要在其中绘制角色。绘制描述的环境。
        5.  **绝对无文字：**最终输出图像不得包含任何文字、标签、数字或注释。必须是纯视觉素描。
        ${previousPage ? `
        **视觉连续性：**
        此页的布局必须是提供的"上一页图像"的逻辑延续。分析其构图并确保平滑的视觉过渡。与之前的素描保持一致的绘画风格。` : ''}

        **要说明的故事：**
        ---
        ${story}
        ---
    `;

    const parts: ({ text: string; } | { inlineData: { data: string; mimeType: string; }})[] = [{ text: prompt }];
    
    if (currentCanvasImage) {
        const mimeType = currentCanvasImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
        parts.push(base64ToGeminiPart(currentCanvasImage, mimeType));
    }

    if (previousPage?.proposalImage) {
        const mimeType = previousPage.proposalImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
        parts.push(base64ToGeminiPart(previousPage.proposalImage, mimeType));
    }
    parts.push(...characterParts);

    const contents = { parts };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    if (!response.candidates?.length) {
        throw new Error("The AI did not return a valid response for the layout proposal.");
    }
    
    const imagePartResponse = response.candidates[0].content.parts.find(part => part.inlineData);
    const textPartResponse = response.candidates[0].content.parts.find(part => part.text);

    if (!imagePartResponse?.inlineData) {
        if (textPartResponse?.text) {
            throw new Error(`The AI did not return an image. Response: "${textPartResponse.text}"`);
        }
        throw new Error("The AI did not return an image for the layout proposal.");
    }

    const proposalImage = `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
    
    return { proposalImage };
}


export async function generateCharacterSheet(
    referenceImagesBase64: string[],
    characterName: string,
    colorMode: 'color' | 'monochrome'
): Promise<string> {
    const imageParts = referenceImagesBase64.map(base64 => {
        const mimeType = base64.match(/data:(image\/.*?);/)?.[1] || 'image/png';
        return base64ToGeminiPart(base64, mimeType);
    });

    const prompt = `
        你是一位专业的漫画艺术家。你的任务是为名为"${characterName}"的角色创建角色参考表。

        **指示：**
        1.  **参考图像：**你获得了多个参考图像。综合所有图像的关键特征来创建单一、连贯的角色设计。例如，如果一张图像显示疤痕，另一张显示角色发型，最终设计中要包含两者。
        2.  **风格：**以干净、${colorMode === 'monochrome' ? '黑白（单色）' : '全彩'}漫画风格生成表，适合艺术家参考。
        3.  **内容和布局：**角色表必须包含恰好六个姿势，排列成两行：
            - **顶行（头像）：**三个头像，显示不同视角和表情（例如侧视、正视中性表情、正视微笑）。
            - **底行（全身）：**三个全身视角（正面、侧面和背面）。
        4.  **输出：**仅生成最终角色表作为单一图像。不要在回应中包含任何文字、标签、名称、描述或解释。输出必须是图像，别无其他。
    `;

    const contents = {
        parts: [{ text: prompt }, ...imageParts],
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

     if (!response.candidates?.length) {
        throw new Error("The AI did not return a valid response for the character sheet. It may have been blocked.");
    }
    
    const imagePartResponse = response.candidates[0].content.parts.find(part => part.inlineData);

    if (imagePartResponse?.inlineData) {
        const base64ImageBytes: string = imagePartResponse.inlineData.data;
        const responseMimeType = imagePartResponse.inlineData.mimeType;
        return `data:${responseMimeType};base64,${base64ImageBytes}`;
    }

    const textPartResponse = response.candidates[0].content.parts.find(part => part.text);
    if(textPartResponse?.text) {
        throw new Error(`The AI did not return an image. Response: "${textPartResponse.text}"`);
    }

    throw new Error("The AI did not return an image for the character sheet.");
}

export async function generateCharacterFromReference(
    referenceSheetImagesBase64: string[],
    characterName: string,
    characterConcept: string,
    colorMode: 'color' | 'monochrome'
): Promise<string> {
    const imageParts = referenceSheetImagesBase64.map(base64 => {
        const mimeType = base64.match(/data:(image\/.*?);/)?.[1] || 'image/png';
        return base64ToGeminiPart(base64, mimeType);
    });

    const prompt = `
        你是一位专业的漫画艺术家。你的任务是使用现有角色表纯粹作为**艺术风格参考**来创建一个**全新的原创角色**。

        **关键指示 - 仔细阅读：**
        1.  **仅限艺术风格：**你获得了角色表，仅用作**艺术风格参考**。分析他们的线条艺术、着色风格（如适用）、阴影技术和整体美学。最终输出的艺术风格必须是这些参考的综合。
        2.  **不要复制参考角色。这是最重要的规则。**你正在从头开始创建一个**新**角色。严格禁止复制或紧密模仿参考表中角色的设计、身体特征（发型、脸型、眼睛）、服装、配饰或身份。参考用于绘画*风格*，而非角色*设计*。
        3.  **新角色概念：**新角色"${characterName}"必须**完全**基于以下描述："${characterConcept}"。此描述是角色外观和设计的唯一真实来源。
        4.  **风格：**以干净、${colorMode === 'monochrome' ? '黑白（单色）' : '全彩'}漫画风格生成表，匹配参考风格。
        5.  **内容和布局：**角色表必须包含恰好六个姿势，排列成两行：
            - **顶行（头像）：**三个头像，显示不同视角和表情（例如侧视、正视中性表情、正视微笑）。
            - **底行（全身）：**三个全身视角（正面、侧面和背面）。
        6.  **输出：**仅生成最终角色表作为单一图像。不要在回应中包含任何文字、标签、名称、描述或解释。输出必须是图像，别无其他。
    `;

    const contents = {
        parts: [{ text: prompt }, ...imageParts],
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

     if (!response.candidates?.length) {
        throw new Error("The AI did not return a valid response for the character sheet. It may have been blocked.");
    }
    
    const imagePartResponse = response.candidates[0].content.parts.find(part => part.inlineData);

    if (imagePartResponse?.inlineData) {
        const base64ImageBytes: string = imagePartResponse.inlineData.data;
        const responseMimeType = imagePartResponse.inlineData.mimeType;
        return `data:${responseMimeType};base64,${base64ImageBytes}`;
    }

    const textPartResponse = response.candidates[0].content.parts.find(part => part.text);
    if(textPartResponse?.text) {
        throw new Error(`The AI did not return an image. Response: "${textPartResponse.text}"`);
    }

    throw new Error("The AI did not return an image for the character sheet.");
}


export async function editCharacterSheet(
    sheetImageBase64: string,
    characterName: string,
    editPrompt: string
): Promise<string> {
    const mimeType = sheetImageBase64.match(/data:(image\/.*?);/)?.[1] || 'image/png';
    const imagePart = base64ToGeminiPart(sheetImageBase64, mimeType);

    const prompt = `
        你是一位专业的漫画艺术家。你的任务是编辑名为"${characterName}"的角色的角色参考表。

        **指示：**
        1.  **参考图像：**使用提供的角色表作为基础。
        2.  **编辑请求：**用户想要以下修改："${editPrompt}"。
        3.  **执行：**将请求的更改应用到角色表上所有姿势的角色。保持现有风格、布局和整体设计。
        4.  **输出：**仅生成最终更新的角色表作为单一图像。不要包含任何文字、标签或解释。
    `;
    
    const contents = {
        parts: [{ text: prompt }, imagePart],
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    if (!response.candidates?.length) {
        throw new Error("The AI did not return a valid response for the character sheet edit.");
    }
    
    const imagePartResponse = response.candidates[0].content.parts.find(part => part.inlineData);
    if (imagePartResponse?.inlineData) {
        return `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
    }

    throw new Error("The AI did not return an updated image for the character sheet.");
}

export async function generateMangaPage(
  characters: Character[],
  panelLayoutImageBase64: string,
  sceneDescription: string,
  colorMode: 'color' | 'monochrome',
  previousPage: Pick<Page, 'generatedImage' | 'sceneDescription'> | undefined,
  generateEmptyBubbles: boolean
): Promise<GeneratedContent> {
  const panelMimeType = panelLayoutImageBase64.match(/data:(image\/.*?);/)?.[1] || 'image/png';
  const panelLayoutPart = base64ToGeminiPart(panelLayoutImageBase64, panelMimeType);
  
  const charactersInScene = characters;
  
  const characterParts = charactersInScene.map(char => {
    const mimeType = char.sheetImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
    return base64ToGeminiPart(char.sheetImage, mimeType);
  });

  const characterReferencePrompt = charactersInScene.map((char, index) => 
    `- **${char.name}:** Use the character sheet provided as "Character Reference ${index + 1}".`
  ).join('\n');

  const hasPreviousPage = previousPage && previousPage.generatedImage;

  const continuationInstruction = hasPreviousPage
    ? `
**CRUCIAL CONTEXT - STORY CONTINUATION:**
This page MUST be a direct continuation of the previous page provided. Analyze the "Previous Page Image" and its script to ensure seamless narrative and artistic continuity. Maintain character appearances, outfits, locations, and a overall mood from the previous page.

**Previous Page Script:**
---
${previousPage.sceneDescription}
---
`
    : '';

  const assetsPrompt = `
    1.  **Character Sheets:** For each character that appears.
    2.  **Panel Layout with Poses:** An image showing the panel composition for the NEW page. This image ALSO CONTAINS visual pose guides for each character, clearly labeled with the character's name.
    3.  **Scene Script:** A detailed, panel-by-panel description of the actions, expressions, and composition for the NEW page.
  `;
  
  const prompt = `
    你是一位专业的漫画艺术家。你的任务是基于提供的素材和详细脚本来创建单页漫画。

    **提供的素材：**
    ${hasPreviousPage ? '1.  **上一页图像：**前一页的内容，用于故事背景。' : ''}
    ${assetsPrompt.replace(/^\s*(\d+)/gm, (match, n) => `    ${hasPreviousPage ? parseInt(n) + 1 : n}`)}

    **角色参考：**
    ${characterReferencePrompt}
    
    ${continuationInstruction}

    **新页面的指示：**
    1.  **关键 - 将姿势匹配到角色：**分镜布局图像用角色名称标记每个姿势。你必须为命名角色使用正确的角色表，并以该姿势绘制他们。如果角色姿势旁有文字注释，将其作为主要动作指示。
    2.  **严格遵循脚本：**场景脚本是表情、镜头构图和叙事背景的指导。精确执行这些细节。如果脚本描述没有角色的场景（例如风景、物体特写），你必须绘制该场景而非角色。
    3.  **角色一致性和数量：**严格按照角色参考表绘制角色外观。**关键地，仅绘制脚本和布局指南中为每个分镜指定的角色数量。不要添加额外角色或省略指定角色。**
    4.  **分镜布局和尺寸：**使用提供的分镜布局作为漫画结构。**布局图像中每个分镜的相对尺寸表示其叙事重要性。较大的分镜应以更多细节、动态构图和焦点描绘关键时刻。**
    5.  **颜色和风格：**以${colorMode === 'monochrome' ? '黑白（单色）' : '全彩'}创建漫画。**所有文字和对话气泡必须有粗体、清晰和厚实的黑色轮廓。**
    6.  **对话气泡：${generateEmptyBubbles ? '分镜布局图像可能包含对话气泡形状。你必须绘制这些对话气泡，但让它们完全空白。不要在内部添加任何文字、对话或音效。' : '如果脚本包含对话，将其放置在分镜布局中绘制的对话气泡内。如果布局中没有气泡但有对话，创建适当的气泡。'}
    7.  **最终输出：**仅生成最终漫画页作为单一图像。不要包含任何文字、描述或解释。

    **新页面的场景脚本：**
    ---
    ${sceneDescription}
    ---
  `;
  
  const parts: ({ text: string; } | { inlineData: { data: string; mimeType: string; }})[] = [{ text: prompt }];
  if (hasPreviousPage) {
    const prevPageMimeType = previousPage.generatedImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
    parts.push(base64ToGeminiPart(previousPage.generatedImage, prevPageMimeType));
  }
  parts.push(...characterParts, panelLayoutPart);

  const contents = { parts };

    const response = await getAiClient().models.generateContent({
    model: 'gemini-2.5-flash-image-preview',
    contents,
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    }
  });
  
  let result: GeneratedContent = { image: null, text: null };

  if (!response.candidates?.length) {
    throw new Error("The AI did not return a valid response. It may have been blocked. " + (response.text || ""));
  }

  for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64ImageBytes: string = part.inlineData.data;
        const mimeType = part.inlineData.mimeType;
        result.image = `data:${mimeType};base64,${base64ImageBytes}`;
      } else if (part.text) {
        result.text = part.text;
      }
  }

  if (!result.image) {
      throw new Error("The AI did not return an image. It might have refused the request. " + (result.text || ""));
  }

  return result;
}

export async function colorizeMangaPage(
    monochromePageBase64: string,
    characters: Character[]
): Promise<string> {
    const pageMimeType = monochromePageBase64.match(/data:(image\/.*?);/)?.[1] || 'image/png';
    const pagePart = base64ToGeminiPart(monochromePageBase64, pageMimeType);

    const characterParts: { inlineData: { data: string; mimeType: string; } }[] = [];
    const characterReferencePrompt = characters.map(char => {
        char.referenceImages.forEach(refImg => {
            const mimeType = refImg.match(/data:(image\/.*?);/)?.[1] || 'image/png';
            characterParts.push(base64ToGeminiPart(refImg, mimeType));
        });
        const sheetMimeType = char.sheetImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
        characterParts.push(base64ToGeminiPart(char.sheetImage, sheetMimeType));
        
        return `- **${char.name}:** Use the provided full-color reference images for ACCURATE color information (hair, eyes, clothing, etc.). Use the black-and-white sheet to understand the character's design and line art.`
    }).join('\n');

    const prompt = `
        你是一位专业的漫画数字着色师。你的任务是为单色漫画页完全着色。

        **提供的素材：**
        1.  **单色漫画页：**需要着色的页面。
        2.  **角色参考：**对于每个角色，按顺序提供一个或多个全彩图像和一张黑白角色表。

        **角色颜色和设计参考：**
        ${characterReferencePrompt}

        **指示：**
        1.  **完全着色：**你必须为整页着色。这包括每个分镜中的所有角色、物体、背景和效果。不要留任何单色区域。
        2.  **关键 - 准确的角色颜色：**这是最重要的规则。你必须使用提供的原始全彩参考图像来确保每个角色以其正确且一致的颜色方案着色。如果为一个角色提供多个颜色参考，逻辑地综合颜色。
        3.  **保持线条艺术：**保留原始黑色线条艺术。不要重绘或更改。你的主要任务是为提供的黑白图像添加颜色，而非创建新绘图。
        4.  **协调的调色板：**确保背景和环境颜色合理，并为场景创造协调的氛围。
        5.  **输出：**仅生成最终的全彩漫画页作为单一图像。
    `;

    const contents = {
        parts: [{ text: prompt }, pagePart, ...characterParts],
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    if (!response.candidates?.length) {
        throw new Error("The AI did not return a valid response for colorization.");
    }
    
    const imagePartResponse = response.candidates[0].content.parts.find(part => part.inlineData);
    if (imagePartResponse?.inlineData) {
        return `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
    }

    throw new Error("The AI did not return a colored image.");
}

export async function editMangaPage(
    originalImageBase64: string,
    prompt: string,
    maskImageBase64?: string,
    referenceImagesBase64?: string[]
): Promise<string> {
    const originalMimeType = originalImageBase64.match(/data:(image\/.*?);/)?.[1] || 'image/png';
    const originalImagePart = base64ToGeminiPart(originalImageBase64, originalMimeType);

    let fullPrompt = `你是一位专业的漫画艺术家和专家数字编辑。你的任务是基于用户指示编辑提供的漫画页面图像。`;

    if (maskImageBase64) {
        fullPrompt += `

**遮罩的关键指示：**
你获得了原始图像和遮罩图像。你的任务是**完全重新渲染**原始图像中在遮罩图像中为**白色**的区域。
- 遮罩的**黑色**区域必须**完全保持不变**于原始图像。
- 你必须将用户的文字提示应用到**整个白色遮罩区域**。更改应该是全面而非微妙的。
- 确保结果与未更改的图像部分无缝且自然地融合。

**用户的请求：** "${prompt}"
`;
    } else {
        fullPrompt += `

**用户的请求：** "${prompt}"

**指示：**
适当地将请求的更改应用到整个图像。
`;
    }

    if (referenceImagesBase64 && referenceImagesBase64.length > 0) {
        fullPrompt += `
**重要参考图像：**
你获得了${referenceImagesBase64.length}个参考图像。这些可能包括角色表或其他视觉指南。
- 如果你的任务涉及添加或纠正角色，你**必须**使用提供的参考图像以完美的准确性绘制他们的设计、特征和服装。
- 将这些图像作为你编辑中风格和内容的主要真实来源。`;
    }

    fullPrompt += `\n**最终输出：**你必须仅生成最终的编辑图像。不要在回应中包含任何文字、标签或解释。`;

    const parts: ({ text: string } | { inlineData: { data: string, mimeType: string } })[] = [
        { text: fullPrompt },
        originalImagePart
    ];

    if (maskImageBase64) {
        const maskMimeType = maskImageBase64.match(/data:(image\/.*?);/)?.[1] || 'image/png';
        parts.push(base64ToGeminiPart(maskImageBase64, maskMimeType));
    }
    if (referenceImagesBase64) {
        referenceImagesBase64.forEach(refImg => {
            const refMimeType = refImg.match(/data:(image\/.*?);/)?.[1] || 'image/png';
            parts.push(base64ToGeminiPart(refImg, refMimeType));
        });
    }
    
    const contents = { parts };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    if (!response.candidates?.length) {
        throw new Error("The AI did not return a valid response for the image edit.");
    }
    
    const imagePartResponse = response.candidates[0].content.parts.find(part => part.inlineData);
    if (imagePartResponse?.inlineData) {
        return `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
    }

    const textPartResponse = response.candidates[0].content.parts.find(part => part.text);
    if (textPartResponse?.text) {
      throw new Error(`The AI did not return an image. Response: "${textPartResponse.text}"`);
    }

    throw new Error("The AI did not return an edited image.");
}


export async function analyzeAndSuggestCorrections(
    panelLayoutImage: string,
    generatedImage: string,
    sceneDescription: string,
    characters: Character[]
): Promise<AnalysisResult> {
    const layoutMimeType = panelLayoutImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
    const layoutPart = base64ToGeminiPart(panelLayoutImage, layoutMimeType);
    const generatedMimeType = generatedImage.match(/data:(image\/.*?);/)?.[1] || 'image/png';
    const generatedPart = base64ToGeminiPart(generatedImage, generatedMimeType);

    const characterInfo = characters.map(c => `- ${c.name}`).join('\n');

    const prompt = `
你是一位细致的漫画创作工具质量保证助手。你的任务是分析生成的漫画页面，如果与原始计划偏离，建议修正。

**提供的素材：**
1.  **布局和姿势指南（图像1）：**这是用户的计划。它显示分镜布局并包含标记的角色骨架姿势。
2.  **生成的漫画页面（图像2）：**这是AI艺术家制作的最终图像。
3.  **场景脚本：**页面上应该发生的事情的文字描述。
4.  **角色列表：**涉及的角色名称。

**你的分析任务：**
仔细比较"生成的漫画页面"与"布局和姿势指南"以及"场景脚本"。寻找以下差异：
-   **缺失或错误的角色：**脚本/指南中的角色是否缺失，或使用了错误的角色？
-   **错误的姿势：**最终图像中的角色姿势是否与骨架指南显著不同？
-   **布局偏差：**分镜形状和排列是否与指南不同？
-   **脚本矛盾：**最终图像是否与脚本中的动作或描述矛盾？
-   **角色重复：**检查同一角色是否在同一分镜内多次出现，或以逻辑上对场景不可能的方式出现。例如，除非脚本指定克隆、双胞胎或魔法效果，否则角色不能同时在两个地方。
-   **背景不当：**分析角色是否被放置在与其角色或场景逻辑矛盾的情况中。例如，应该隐藏的角色不应在明处。被描述为悲伤的角色不应有不恰当的欢快姿势。

**你的输出：**
你必须用以下结构回应单个JSON对象：
{
  "analysis": "对你的发现的简要、人类可读的总结。描述你发现的任何差异，或声明图像是准确的。",
  "has_discrepancies": boolean, // 如果你发现任何问题则为true，否则为false。
  "correction_prompt": "如果has_discrepancies为true，写一个详细、具体且清晰的指示提示给图像编辑AI，一次性修复所有识别的问题。如果为false，这应该是一个空字符串。"
}

**示例修正提示：**
"在左上角分镜中，重绘角色'Kaito'以匹配骨架姿势，确保他持剑。在底部分镜中，添加当前缺失的角色'Anya'；她应该显示为惊讶。在右侧，'Kaito'的两个实例是一个错误，移除较远的那个。保持艺术风格一致。"

**场景脚本：**
---
${sceneDescription}
---

**场景中的角色：**
${characterInfo}
`;
    const contents = {
        parts: [{ text: prompt }, layoutPart, generatedPart],
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    analysis: { type: Type.STRING },
                    has_discrepancies: { type: Type.BOOLEAN },
                    correction_prompt: { type: Type.STRING },
                },
                required: ["analysis", "has_discrepancies", "correction_prompt"]
            }
        }
    });
    
    try {
        const jsonText = response.text;
        const result = JSON.parse(jsonText) as AnalysisResult;
        return result;
    } catch (e) {
        console.error("Failed to parse analysis JSON:", e);
        throw new Error("The AI returned an invalid analysis structure.");
    }
}