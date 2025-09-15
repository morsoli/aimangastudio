export interface Shape {
  id: string;
  type: 'panel' | 'text' | 'bubble' | 'drawing' | 'image' | 'arrow';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
}

export interface PanelShape extends Shape {
  type: 'panel';
  points: { x: number; y: number }[];
  width: number;
  height: number;
}

export interface TextShape extends Shape {
  type: 'text';
  text: string;
  fontSize: number;
  width: number;
  height: number;
}

export interface BubbleShape extends Shape {
    type: 'bubble';
    bubbleType: 'rounded' | 'oval' | 'rect';
    width: number;
    height: number;
    text: string;
    tail?: { x: number; y: number };
}

export interface DrawingShape extends Shape {
    type: 'drawing';
    points: { x: number; y: number }[][];
    strokeColor: string;
    strokeWidth: number;
}

export interface ArrowShape extends Shape {
  type: 'arrow';
  points: [{ x: number; y: number }, { x: number; y: number }];
  strokeColor: string;
  strokeWidth: number;
}

export interface SkeletonData {
  [key: string]: { x: number; y: number };
  // Making these optional for backward compatibility with saved data.
  // The editor will provide defaults if they are missing.
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  nose?: { x: number; y: number };
  mouth?: { x: number; y: number };
}

export interface SkeletonPose {
  type: 'skeleton';
  preset: 'full' | 'upper' | 'lower' | 'face';
  data: SkeletonData;
  comment: string;
}

export type Pose = 
  | SkeletonPose
  | { type: 'image'; href: string; }
  // Points are normalized to the character's bounding box [0, 1]
  | { type: 'drawing'; points: { x: number; y: number }[][]; };


export interface ImageShape extends Shape {
    type: 'image';
    href: string; // base64
    characterId: string;
    panelIndex: number;
    width: number;
    height: number;
    pose?: Pose;
}


export type CanvasShape = PanelShape | TextShape | BubbleShape | DrawingShape | ImageShape | ArrowShape;

export interface GeneratedContent {
    image: string | null;
    text: string | null;
}

export interface Character {
    id: string;
    name: string;
    referenceImages: string[]; // Original uploaded images
    sheetImage: string; // AI-generated sheet
    description?: string; // Optional character description/setting
}

export interface ViewTransform {
    scale: number;
    x: number;
    y: number;
}

export interface Page {
    id:string;
    name: string;
    shapes: CanvasShape[];
    shapesHistory: CanvasShape[][];
    shapesHistoryIndex: number;
    panelLayoutImage: string | null;
    sceneDescription: string; // AI-generated, user-editable script. No longer nullable.
    panelCharacterMap: { [panelIndex: number]: string }; // Kept for reference, but image shapes are primary
    generatedImage: string | null;
    generatedText: string | null;
    generatedColorMode: 'color' | 'monochrome' | null;
    aspectRatio: string;
    viewTransform: ViewTransform;
    shouldReferencePrevious: boolean;
    assistantProposalImage: string | null;
    proposalOpacity: number;
    isProposalVisible: boolean;
    proposedShapes: CanvasShape[] | null;
}

export interface StorySuggestion {
  summary: string;
  panels: {
    panel: number;
    description: string;
    dialogue?: string;
  }[];
}

export interface AnalysisResult {
  analysis: string;
  has_discrepancies: boolean;
  correction_prompt: string;
}

// Types for AI Video Producer
export interface AISuggestions {
  transition: string;
  vfx: string;
  camera: string;
  narrative: string;
}

export type VideoModelId = 'seedance' | 'hailuo' | 'veo' | 'kling';

export interface VideoScene {
  id: string;
  description: string;
  duration: number;
  startFrame?: string;
  endFrame?: string;
  aiSuggestions?: AISuggestions;
  finalPrompt?: string;
  sourcePageIndex: number;
  charactersInScene: string[];
  isLoading: boolean;
  prompts?: {
    seedance?: string;
    hailuo?: string;
    veo?: string;
    kling?: string;
  };
  recommendedModel?: VideoModelId;
  reasoning?: string;
  generatedVideoUrl?: string;
  videoGenerationStatus?: 'idle' | 'pending' | 'done' | 'error';
  videoGenerationProgress?: string;
}

export interface InitialSceneData {
    sceneDescription: string;
    narrative: string;
    duration: number;
    charactersInScene: string[];
    sourcePageIndex: number;
    recommendedModel: VideoModelId;
    reasoning: string;
}

// Intermediate type from the first Gemini call in the storyboard generation process
export interface SceneAnalysis {
    sceneDescription: string;
    duration: number;
    startFramePrompt: string;
    endFramePrompt: string;
    aiSuggestions: AISuggestions;
    finalPrompt: string;
    sourcePageIndex: number;
    charactersInScene: string[];
    // FIX: Added missing 'narrative' property to align with the schema used in videoGeminiService.
    narrative: string;
}