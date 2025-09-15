import React, { useState, useRef, useCallback, useImperativeHandle, useEffect, forwardRef, useMemo } from 'react';
import type { CanvasShape, BubbleShape, PanelShape, Character, ImageShape, TextShape, ViewTransform, Pose, SkeletonData, DrawingShape, SkeletonPose, ArrowShape } from '../types';
import { PolygonIcon, TextToolIcon, BubbleToolIcon, TrashIcon, SelectIcon, CircleIcon, SquareIcon, XIcon, BrushIcon, ExpandIcon, ShrinkIcon, HandIcon, PlusIcon, EditPoseIcon, MinusIcon, UploadIcon, RedoIcon, UndoIcon, EyeIcon, EyeOffIcon, ArrowIcon } from './icons';
import { useLocalization } from '../hooks/useLocalization';
import type { LocaleKeys } from '../i18n/locales';
import { PoseEditorModal } from './PoseEditorModal';

interface PanelEditorProps {
  shapes: CanvasShape[];
  onShapesChange: (shapes: CanvasShape[], recordHistory?: boolean) => void;
  characters: Character[];
  aspectRatio: string;
  viewTransform: ViewTransform;
  onViewTransformChange: (vt: ViewTransform) => void;
  isDraggingCharacter: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  proposalImage: string | null;
  proposalOpacity: number;
  isProposalVisible: boolean;
  onProposalSettingsChange: (updates: { proposalOpacity?: number; isProposalVisible?: boolean }) => void;
  onApplyLayout: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const ASPECT_RATIO_CONFIG: { [key: string]: { w: number, h: number } } = {
    'A4': { w: 595, h: 842 },
    '竖版': { w: 600, h: 800 },
    '正方形': { w: 800, h: 800 },
    '横版': { w: 1280, h: 720 }
};

type Tool = 'select' | 'panel' | 'text' | 'bubble' | 'draw' | 'pan' | 'arrow';
type BubbleType = 'rounded' | 'oval' | 'rect';
type Action = 
  | { type: 'none' }
  | { type: 'creating'; shape: CanvasShape }
  | { type: 'panning'; startPos: {x: number, y: number}, startVT: ViewTransform }
  // FIX: Renamed 'panningShape' action to 'drawing' for clarity.
  | { type: 'drawing'; shapeId: string, currentStroke: {x:number, y:number}[] }
  | { type: 'dragging'; shapeId: string; startOffset: {x: number, y: number} }
  | { type: 'resizing'; shapeId: string; handle: string; originalShape: BubbleShape | ImageShape | TextShape }
  | { type: 'draggingTail'; shapeId: string }
  | { type: 'editingPanelVertex'; shapeId: string, vertexIndex: number }
  | { type: 'draggingArrowHandle'; shapeId: string; handleIndex: 0 | 1 };

const getBubblePath = (shape: BubbleShape): string => {
    const { x, y, width, height, tail, bubbleType } = shape;
    let bodyPath: string;
    if (bubbleType === 'oval') {
        const rx = width / 2;
        const ry = height / 2;
        const cx = x + rx;
        const cy = y + ry;
        bodyPath = `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${width},0 a ${rx},${ry} 0 1,0 ${-width},0`;
    } else {
        const cornerRadius = bubbleType === 'rounded' ? Math.min(20, width / 2, height / 2) : 0;
        bodyPath = `M ${x + cornerRadius},${y} L ${x + width - cornerRadius},${y} Q ${x + width},${y} ${x + width},${y + cornerRadius} L ${x + width},${y + height - cornerRadius} Q ${x + width},${y + height} ${x + width - cornerRadius},${y + height} L ${x + cornerRadius},${y + height} Q ${x},${y + height} ${x},${y + height - cornerRadius} L ${x},${y + cornerRadius} Q ${x},${y} ${x + cornerRadius},${y} Z`;
    }
    if (!tail) return bodyPath;

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const dx = tail.x - centerX;
    const dy = tail.y - centerY;
    
    if (dx === 0 && dy === 0) return bodyPath;

    const angle = Math.atan2(dy, dx);
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    
    let intersectX, intersectY;
    if (bubbleType === 'oval') {
        const rx = width / 2;
        const ry = height / 2;
        const tanAngle = Math.tan(angle);
        intersectX = centerX + rx * ry / Math.sqrt(ry*ry + rx*rx * tanAngle*tanAngle) * (Math.abs(angle) < Math.PI / 2 ? 1 : -1);
        intersectY = centerY + rx * ry * tanAngle / Math.sqrt(ry*ry + rx*rx * tanAngle*tanAngle) * (Math.abs(angle) < Math.PI / 2 ? 1 : -1);
    } else {
        const tX = Math.abs(cosAngle) > 1e-6 ? (width / 2) / Math.abs(cosAngle) : Infinity;
        const tY = Math.abs(sinAngle) > 1e-6 ? (height / 2) / Math.abs(sinAngle) : Infinity;
        const t = Math.min(tX, tY);
        intersectX = centerX + t * cosAngle;
        intersectY = centerY + t * sinAngle;
    }

    const tailWidth = Math.min(width, height) * 0.15;
    const p1x = intersectX - Math.sin(angle) * tailWidth * 0.5;
    const p1y = intersectY + Math.cos(angle) * tailWidth * 0.5;
    const p2x = intersectX + Math.sin(angle) * tailWidth * 0.5;
    const p2y = intersectY - Math.cos(angle) * tailWidth * 0.5;
    return `${bodyPath} M ${p1x},${p1y} L ${tail.x},${tail.y} L ${p2x},${p2y} Z`;
};

const getDrawingPath = (drawing: CanvasShape): string => {
    if (drawing.type !== 'drawing') return '';
    return drawing.points.map(stroke => 
        stroke.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x} ${p.y}`).join(' ')
    ).join(' ');
}

const getShapeBBox = (shape: CanvasShape) => {
    if (shape.type === 'panel' || shape.type === 'arrow') {
        const points = shape.points.flat();
        if (points.length === 0) return { x: shape.x, y: shape.y, width: 0, height: 0 };
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }
    if (shape.type === 'drawing') {
        if (shape.points.length === 0 || shape.points[0].length === 0) {
            return { x: shape.x, y: shape.y, width: 0, height: 0 };
        }
        const allPoints = shape.points.flat();
        const xs = allPoints.map(p => p.x);
        const ys = allPoints.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }
    return { x: shape.x, y: shape.y, width: shape.width || 0, height: shape.height || 0 };
}

const getPolygonCentroid = (points: { x: number; y: number }[]) => {
    const getBBoxCenter = () => {
        if (points.length === 0) return { x: 0, y: 0 };
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return { x: minX + (Math.max(...xs) - minX) / 2, y: minY + (Math.max(...ys) - minY) / 2 };
    };

    if (points.length < 3) {
        return getBBoxCenter();
    }

    let area = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const crossProduct = (p1.x * p2.y - p2.x * p1.y);
        area += crossProduct;
        cx += (p1.x + p2.x) * crossProduct;
        cy += (p1.y + p2.y) * crossProduct;
    }

    area /= 2;
    
    // Avoid division by zero for collinear points or very small areas
    if (Math.abs(area) < 1e-6) {
        return getBBoxCenter();
    }

    cx /= (6 * area);
    cy /= (6 * area);

    return { x: cx, y: cy };
};


const createInitialSkeleton = (x: number, y: number, width: number, height: number): SkeletonData => {
    const centerX = x + width / 2;
    const topY = y + height * 0.15; // old head position, let's use as head center
    const hipY = y + height * 0.5;
    const armY = y + height * 0.3; // neck/shoulder line
    const legY = y + height * 0.9;
    const shoulderWidth = width * 0.2;
    const hipWidth = width * 0.15;

    // Face points relative to head center (topY)
    const eyeY = topY - height * 0.03;
    const eyeDistX = width * 0.07;
    const noseY = topY;
    const mouthY = topY + height * 0.05;

    return {
        head: { x: centerX, y: topY },
        neck: { x: centerX, y: armY },
        leftShoulder: { x: centerX - shoulderWidth, y: armY },
        rightShoulder: { x: centerX + shoulderWidth, y: armY },
        leftElbow: { x: centerX - shoulderWidth * 1.5, y: hipY },
        rightElbow: { x: centerX + shoulderWidth * 1.5, y: hipY },
        leftHand: { x: centerX - shoulderWidth * 1.2, y: legY - height * 0.1 },
        rightHand: { x: centerX + shoulderWidth * 1.2, y: legY - height * 0.1 },
        hips: { x: centerX, y: hipY },
        leftHip: { x: centerX - hipWidth, y: hipY },
        rightHip: { x: centerX + hipWidth, y: hipY },
        leftKnee: { x: centerX - hipWidth, y: hipY + height * 0.2 },
        rightKnee: { x: centerX + hipWidth, y: hipY + height * 0.2 },
        leftFoot: { x: centerX - hipWidth, y: legY },
        rightFoot: { x: centerX + hipWidth, y: legY },
        // New Face Points
        leftEye: { x: centerX - eyeDistX, y: eyeY },
        rightEye: { x: centerX + eyeDistX, y: eyeY },
        nose: { x: centerX, y: noseY },
        mouth: { x: centerX, y: mouthY },
    };
};
const skeletonConnections = [
    ['head', 'neck'], ['neck', 'leftShoulder'], ['neck', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftHand'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightHand'],
    ['neck', 'hips'],
    ['hips', 'leftHip'], ['hips', 'rightHip'],
    ['leftHip', 'leftKnee'], ['leftKnee', 'leftFoot'],
    ['rightHip', 'rightKnee'], ['rightKnee', 'rightFoot'],
    // Face connections
    ['leftEye', 'rightEye'],
    ['nose', 'mouth'],
];


export const PanelEditor = forwardRef<
    { getLayoutAsImage: (includeCharacters: boolean, characters: Character[]) => Promise<string> },
    PanelEditorProps
>(({ shapes, onShapesChange, characters, aspectRatio, viewTransform, onViewTransformChange, isDraggingCharacter, onUndo, onRedo, canUndo, canRedo, proposalImage, proposalOpacity, isProposalVisible, onProposalSettingsChange, onApplyLayout, isFullscreen, onToggleFullscreen }, ref) => {
  const { t } = useLocalization();
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [activeBubbleType, setActiveBubbleType] = useState<BubbleType>('rounded');
  const [action, setAction] = useState<Action>({ type: 'none' });
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [posingCharacter, setPosingCharacter] = useState<ImageShape | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [cursorPreview, setCursorPreview] = useState<{ x: number; y: number } | null>(null);
  const [drawingGuideRect, setDrawingGuideRect] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  
  const isSpacePressed = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const textEditRef = useRef<HTMLTextAreaElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);

  const canvasConfig = useMemo(() => ASPECT_RATIO_CONFIG[aspectRatio] || ASPECT_RATIO_CONFIG['A4'], [aspectRatio]);

    const fitAndCenterCanvas = useCallback(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const { width: viewWidth, height: viewHeight } = svg.getBoundingClientRect();
        if (viewWidth === 0 || viewHeight === 0) return;

        const { w: pageWidth, h: pageHeight } = canvasConfig;
        const scaleX = viewWidth / pageWidth;
        const scaleY = viewHeight / pageHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9; // Fit with 10% margin
        const x = (viewWidth - (pageWidth * scale)) / 2;
        const y = (viewHeight - (pageHeight * scale)) / 2;
        onViewTransformChange({ scale, x, y });
    }, [canvasConfig, onViewTransformChange]);

  useEffect(() => {
    fitAndCenterCanvas();
  }, [fitAndCenterCanvas]);

  useEffect(() => {
    if (editingShapeId && textEditRef.current) {
        textEditRef.current.focus();
        textEditRef.current.select();
    }
  }, [editingShapeId]);
  
    const deleteShape = (id: string) => onShapesChange(shapes.filter(s => s.id !== id));

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.metaKey || e.ctrlKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        canRedo && onRedo();
                    } else {
                        canUndo && onUndo();
                    }
                }
                if (e.key === 'y') {
                    e.preventDefault();
                    canRedo && onRedo();
                }
          }
          if (e.key === ' ' && !isSpacePressed.current && !editingShapeId && !posingCharacter) {
              isSpacePressed.current = true;
              e.preventDefault();
          }
          if (e.key === 'Escape') {
            setEditingShapeId(null);
            setPosingCharacter(null);
          }
          if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId && !editingShapeId && !posingCharacter) {
              deleteShape(selectedShapeId);
              setSelectedShapeId(null);
          }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === ' ') isSpacePressed.current = false;
      };
      
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, [selectedShapeId, editingShapeId, posingCharacter, onUndo, onRedo, canUndo, canRedo]);

  const getMousePos = useCallback((e: React.MouseEvent | MouseEvent | TouchEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const CTM = svg.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    pt.x = clientX;
    pt.y = clientY;
    const transformedPt = pt.matrixTransform(CTM.inverse());
    
    return {
      x: (transformedPt.x - viewTransform.x) / viewTransform.scale,
      y: (transformedPt.y - viewTransform.y) / viewTransform.scale
    };
  }, [viewTransform]);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
     // Pan if clicking on gray area outside canvas
    if ((e.target as SVGSVGElement).isSameNode(svgRef.current)) {
        setAction({ type: 'panning', startPos: { x: e.clientX, y: e.clientY }, startVT: viewTransform });
        return;
    }

    const pos = getMousePos(e);
    if (isSpacePressed.current || activeTool === 'pan') {
        setAction({ type: 'panning', startPos: { x: e.clientX, y: e.clientY }, startVT: viewTransform });
        return;
    }
        
    setSelectedShapeId(null);
    
    const id = Date.now().toString();
    let newShape: CanvasShape | null = null;
    
    switch(activeTool) {
        case 'panel':
            newShape = { id, type: 'panel', points: [], x: pos.x, y: pos.y, width: 0, height: 0 };
            setDrawingGuideRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
            setAction({type: 'creating', shape: newShape});
            break;
        case 'text':
            newShape = { id, type: 'text', text: "Enter Text", x: pos.x, y: pos.y - 20, fontSize: 30, width: 200, height: 40 };
            onShapesChange([...shapes, newShape]);
            setActiveTool('select');
            setSelectedShapeId(id);
            setTimeout(() => setEditingShapeId(id), 0);
            return;
        case 'bubble':
            newShape = { id, type: 'bubble', bubbleType: activeBubbleType, text: 'Double-click to edit', x: pos.x, y: pos.y, width: 0, height: 0 };
            setAction({type: 'creating', shape: newShape});
            break;
        case 'draw': {
            const newStroke = [pos];
            newShape = { id, type: 'drawing', points: [newStroke], x: pos.x, y: pos.y, strokeColor: brushColor, strokeWidth: brushSize };
            setAction({type: 'drawing', shapeId: id, currentStroke: newStroke});
            onShapesChange([...shapes, newShape], false);
            return;
        }
        case 'arrow': {
            const startPoint = pos;
            newShape = { id, type: 'arrow', points: [startPoint, startPoint], x: pos.x, y: pos.y, strokeColor: '#FF0000', strokeWidth: brushSize };
            setAction({type: 'creating', shape: newShape});
            break;
        }
    }
    
    if (newShape) onShapesChange([...shapes, newShape], false);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getMousePos(e);
    if (activeTool === 'draw' || activeTool === 'arrow') {
        setCursorPreview(pos);
    } else {
        setCursorPreview(null);
    }
    if (action.type === 'none') return;
    
    let newShapes: CanvasShape[] | undefined;
    switch (action.type) {
        case 'panning': {
            const dx = e.clientX - action.startPos.x;
            const dy = e.clientY - action.startPos.y;
            onViewTransformChange({ scale: action.startVT.scale, x: action.startVT.x + dx, y: action.startVT.y + dy });
            return;
        }
        case 'creating': {
            const startX = action.shape.x;
            const startY = action.shape.y;
            const newX = Math.min(pos.x, startX);
            const newY = Math.min(pos.y, startY);
            const newWidth = Math.abs(pos.x - startX);
            const newHeight = Math.abs(pos.y - startY);

            if (action.shape.type === 'panel') {
                setDrawingGuideRect({ x: newX, y: newY, width: newWidth, height: newHeight });
            }
            if (action.shape.type === 'arrow') {
                newShapes = shapes.map(s => {
                    if (s.id !== action.shape.id) return s;
                    const newPoints: [{x:number, y:number}, {x:number, y:number}] = [(s as ArrowShape).points[0], pos];
                    return {...s, points: newPoints};
                });
                break;
            }

            newShapes = shapes.map(s => {
                if (s.id !== action.shape.id) return s;
                if(s.type === 'panel') {
                    return {...s, x: newX, y: newY, width: newWidth, height: newHeight, points: [ {x: newX, y: newY}, {x: newX + newWidth, y: newY}, {x: newX + newWidth, y: newY + newHeight}, {x: newX, y: newY + newHeight} ]}
                }
                return { ...s, x: newX, y: newY, width: newWidth, height: newHeight } as CanvasShape
            });
            break;
        }
        case 'drawing': {
            const newCurrentStroke = [...action.currentStroke, pos];
            newShapes = shapes.map(s => {
                if (s.id === action.shapeId && s.type === 'drawing') {
                    const pointsCopy: { x: number; y: number }[][] = JSON.parse(JSON.stringify(s.points));
                    pointsCopy[pointsCopy.length - 1] = newCurrentStroke;
                    return { ...s, points: pointsCopy };
                }
                return s;
            });
            setAction({ ...action, currentStroke: newCurrentStroke });
            break;
        }
        case 'dragging': {
            newShapes = shapes.map(s => {
                if (s.id !== action.shapeId) return s;
                
                const newX = pos.x - action.startOffset.x;
                const newY = pos.y - action.startOffset.y;
                const dx = newX - s.x;
                const dy = newY - s.y;

                switch (s.type) {
                    case 'panel': {
                        const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                        const xs = newPoints.map(p => p.x);
                        const ys = newPoints.map(p => p.y);
                        const minX = Math.min(...xs);
                        const minY = Math.min(...ys);
                        return { ...s, points: newPoints, x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
                    }
                    case 'arrow': {
                        const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) as [{ x: number, y: number }, { x: number, y: number }];
                        return { ...s, points: newPoints, x: newX, y: newY };
                    }
                    case 'drawing': {
                        const newStrokes = s.points.map(stroke => stroke.map(p => ({ x: p.x + dx, y: p.y + dy })));
                        return { ...s, points: newStrokes, x: newX, y: newY };
                    }
                    default: {
                        const updatedShape = { ...s, x: newX, y: newY };
                        if (updatedShape.type === 'bubble' && updatedShape.tail) {
                            updatedShape.tail = { x: updatedShape.tail.x + dx, y: updatedShape.tail.y + dy };
                        }
                        if (updatedShape.type === 'image' && updatedShape.pose?.type === 'skeleton') {
                            const pose = updatedShape.pose;
                            const newSkeletonData: SkeletonData = {};
                            for (const key in pose.data) {
                                const point = pose.data[key as keyof SkeletonData];
                                if (point) {
                                    newSkeletonData[key as keyof SkeletonData] = {
                                        x: point.x + dx,
                                        y: point.y + dy,
                                    };
                                }
                            }
                            updatedShape.pose = { ...pose, data: newSkeletonData };
                        }
                        return updatedShape;
                    }
                }
            });
            break;
        }
        case 'draggingTail': {
            newShapes = shapes.map(s => s.id === action.shapeId ? {...s, tail: pos} as CanvasShape : s);
            break;
        }
        case 'editingPanelVertex': {
            newShapes = shapes.map(s => {
                if (s.id !== action.shapeId || s.type !== 'panel') return s;
                const newPoints = [...s.points];
                newPoints[action.vertexIndex] = pos;
                return {...s, points: newPoints};
            });
            break;
        }
        case 'draggingArrowHandle': {
            newShapes = shapes.map(s => {
                if (s.id === action.shapeId && s.type === 'arrow') {
                    const newPoints = [...s.points] as [{x:number, y:number}, {x:number, y:number}];
                    newPoints[action.handleIndex] = pos;
                    return { ...s, points: newPoints };
                }
                return s;
            });
            break;
        }
        case 'resizing': {
            const { shapeId, handle, originalShape } = action;
            let { x, y, width, height } = { ...originalShape };

            if (handle.includes('right')) {
                width = Math.max(20, pos.x - x);
            }
            if (handle.includes('bottom')) {
                height = Math.max(20, pos.y - y);
            }
            if (handle.includes('left')) {
                const newWidth = Math.max(20, (originalShape.x + originalShape.width) - pos.x);
                x = (originalShape.x + originalShape.width) - newWidth;
                width = newWidth;
            }
            if (handle.includes('top')) {
                const newHeight = Math.max(20, (originalShape.y + originalShape.height) - pos.y);
                y = (originalShape.y + originalShape.height) - newHeight;
                height = newHeight;
            }
            
            newShapes = shapes.map(s => {
                if (s.id !== shapeId) return s;
                let updatedShape = { ...s, x, y, width, height } as CanvasShape;

                if (updatedShape.type === 'image' && originalShape.type === 'image' && originalShape.width > 0 && originalShape.height > 0) {
                    if (updatedShape.pose?.type === 'skeleton' && originalShape.pose?.type === 'skeleton') {
                        const originalPose = originalShape.pose;
                        const originalSkeletonData = originalPose.data;
                        const scaleX = width / originalShape.width;
                        const scaleY = height / originalShape.height;
                        const newSkeletonData: SkeletonData = {};

                        for (const key in originalSkeletonData) {
                            const originalPoint = originalSkeletonData[key as keyof SkeletonData];
                            if (!originalPoint) continue;
                            const relativeX = originalPoint.x - originalShape.x;
                            const relativeY = originalPoint.y - originalShape.y;
                            newSkeletonData[key as keyof SkeletonData] = {
                                x: x + (relativeX * scaleX),
                                y: y + (relativeY * scaleY),
                            };
                        }
                        updatedShape.pose = { ...updatedShape.pose, data: newSkeletonData };
                    }
                }
                return updatedShape;
            });
            break;
        }
    }
    if (newShapes) onShapesChange(newShapes, false);
  };
  
  const handleMouseUp = (e: React.MouseEvent) => {
    setDrawingGuideRect(null);
    if (action.type === 'creating' && (action.shape.type === 'panel' || action.shape.type === 'bubble' || action.shape.type === 'arrow')) {
      setActiveTool('select');
      setSelectedShapeId(action.shape.id);
    }
    if (action.type === 'creating' || action.type === 'dragging' || action.type === 'resizing' || action.type === 'draggingTail' || action.type === 'editingPanelVertex' || action.type === 'drawing' || action.type === 'draggingArrowHandle') {
        const shape = shapes.find(s => s.id === (action as any).shapeId || s.id === (action as any).shape?.id);
        if (shape && (shape.type === 'bubble' || shape.type === 'panel') && (shape.width < 10 || shape.height < 10)) {
            onShapesChange(shapes.filter(s => s.id !== shape.id), true);
        } else {
             onShapesChange(shapes, true);
        }
    }
    setAction({type: 'none'});
  };
  
  const handleShapeInteraction = (e: React.MouseEvent, shape: CanvasShape, type: 'shape' | 'resize' | 'tail' | 'panelVertex' | 'arrowHandle', handle?: string | number) => {
    if (activeTool !== 'select' && activeTool !== 'pan') return;
    if (e.button !== 0) return;
    e.stopPropagation();

    if (activeTool === 'pan' || isSpacePressed.current) {
        setAction({ type: 'panning', startPos: { x: e.clientX, y: e.clientY }, startVT: viewTransform });
        return;
    }

    setSelectedShapeId(shape.id);
    const pos = getMousePos(e);
    
    const bbox = getShapeBBox(shape);
    
    if (type === 'shape') {
        setAction({ type: 'dragging', shapeId: shape.id, startOffset: {x: pos.x - bbox.x, y: pos.y - bbox.y} });
    } else if (type === 'resize' && (shape.type === 'bubble' || shape.type === 'image' || shape.type === 'text') && typeof handle === 'string') {
        setAction({ type: 'resizing', shapeId: shape.id, handle, originalShape: shape as BubbleShape | ImageShape | TextShape });
    } else if (type === 'tail' && shape.type === 'bubble') {
        setAction({ type: 'draggingTail', shapeId: shape.id });
    } else if (type === 'panelVertex' && shape.type === 'panel' && typeof handle === 'number') {
        setAction({ type: 'editingPanelVertex', shapeId: shape.id, vertexIndex: handle });
    } else if (type === 'arrowHandle' && shape.type === 'arrow' && typeof handle === 'number') {
        setAction({ type: 'draggingArrowHandle', shapeId: shape.id, handleIndex: handle as 0 | 1 });
    }
  };

  const handleAddPanelVertex = (e: React.MouseEvent, shape: PanelShape, edgeIndex: number) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;

    const p1 = shape.points[edgeIndex];
    const p2 = shape.points[(edgeIndex + 1) % shape.points.length];
    const newPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const newPoints = [...shape.points];
    newPoints.splice(edgeIndex + 1, 0, newPoint);

    onShapesChange(
        shapes.map(s => (s.id === shape.id && s.type === 'panel' ? { ...s, points: newPoints } : s)),
        true
    );

    // Immediately start dragging the new point
    setAction({
        type: 'editingPanelVertex',
        shapeId: shape.id,
        vertexIndex: edgeIndex + 1,
    });
};
  
  const handleShapeDoubleClick = (e: React.MouseEvent, shape: CanvasShape) => {
    if (shape.type === 'text' || shape.type === 'bubble') {
        e.stopPropagation();
        setEditingShapeId(shape.id);
    }
  };

  const renderPose = (imageShape: ImageShape) => {
    if (!imageShape.pose) return null;
    const { pose } = imageShape;

    if (pose.type === 'skeleton') {
        const { data, preset } = pose;

        const allJointKeys = Object.keys(createInitialSkeleton(0, 0, 0, 0));
        const presetJoints: Record<SkeletonPose['preset'], string[]> = {
            face: ['head', 'leftEye', 'rightEye', 'nose', 'mouth'],
            upper: ['head', 'neck', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftHand', 'rightHand', 'hips', 'leftEye', 'rightEye', 'nose', 'mouth'],
            lower: ['hips', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftFoot', 'rightFoot'],
            full: allJointKeys,
        };
        const visibleJoints = new Set(presetJoints[preset || 'full']);
        const visibleConnections = skeletonConnections.filter(([start, end]) => visibleJoints.has(start) && visibleJoints.has(end));
        
        return (
            <g pointerEvents="none" opacity="0.8">
                {visibleConnections.map(([start, end]) => {
                    if(!data[start] || !data[end]) return null;
                    return <line key={`${start}-${end}`} x1={data[start].x} y1={data[start].y} x2={data[end].x} y2={data[end].y} stroke="#00BFFF" strokeWidth={4/viewTransform.scale} strokeLinecap='round'/>
                })}
                {Object.entries(data).filter(([key]) => visibleJoints.has(key)).map(([key, pos]) => {
                    if (!pos) return null;
                    return <circle key={key} cx={pos.x} cy={pos.y} r={6/viewTransform.scale} fill={key === 'head' ? '#FF4500' : '#FF00FF'} stroke="white" strokeWidth={1/viewTransform.scale} />
                })}
            </g>
        )
    }
    if (pose.type === 'image') {
        return <image href={pose.href} x={imageShape.x} y={imageShape.y} width={imageShape.width} height={imageShape.height} opacity="0.8" pointerEvents="none" />;
    }
    if (pose.type === 'drawing') {
        const transformedPoints = pose.points.map(stroke =>
            stroke.map(p => ({
                x: imageShape.x + p.x * imageShape.width,
                y: imageShape.y + p.y * imageShape.height,
            }))
        );
        const pathData = transformedPoints.map(stroke => stroke.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ')).join(' ');
        return <path d={pathData} fill="none" stroke="red" strokeWidth={3/viewTransform.scale} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" pointerEvents="none" />
    }
    return null;
  }

  useImperativeHandle(ref, () => ({
    getLayoutAsImage: async (includeCharacters: boolean, charactersToDraw: Character[]): Promise<string> => {
        return new Promise((resolve, reject) => {
            const originalSelectedId = selectedShapeId;
            setSelectedShapeId(null);
            setTimeout(() => {
                const svg = svgRef.current;
                if (!svg) return reject("SVG element not found");
                
                const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                tempSvg.setAttribute("width", canvasConfig.w.toString());
                tempSvg.setAttribute("height", canvasConfig.h.toString());
                tempSvg.setAttribute("viewBox", `0 0 ${canvasConfig.w} ${canvasConfig.h}`);
                
                const style = document.createElement('style');
                style.textContent = `text { font-family: sans-serif; }`;
                tempSvg.appendChild(style);

                const contentGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                
                // Draw panels first
                shapes.filter(s => s.type === 'panel').forEach((shape, index) => {
                    const panel = shape as PanelShape;
                    const p = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                    p.setAttribute('points', panel.points.map(pt => `${pt.x},${pt.y}`).join(' '));
                    p.setAttribute('fill', 'none');
                    p.setAttribute('stroke', 'black');
                    p.setAttribute('stroke-width', '4');
                    contentGroup.appendChild(p);

                    const centroid = getPolygonCentroid(panel.points);
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute('x', String(centroid.x));
                    text.setAttribute('y', String(centroid.y));
                    text.setAttribute('font-size', '60');
                    text.setAttribute('font-weight', 'bold');
                    text.setAttribute('fill', 'rgba(0,0,0,0.2)');
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('dominant-baseline', 'central');
                    text.textContent = String(index + 1);
                    contentGroup.appendChild(text);
                });
                
                // Draw characters and poses
                if (includeCharacters) {
                    shapes.filter(s => s.type === 'image').forEach(shape => {
                        const imgShape = shape as ImageShape;
                        const character = charactersToDraw.find(c => c.id === imgShape.characterId);
                        
                        const { pose } = imgShape;
                        if (pose) {
                          if (pose.type === 'skeleton') {
                              const { data } = pose;
                              skeletonConnections.forEach(([start, end]) => {
                                  if(!data[start] || !data[end]) return;
                                  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                                  line.setAttribute('x1', String(data[start]!.x));
                                  line.setAttribute('y1', String(data[start]!.y));
                                  line.setAttribute('x2', String(data[end]!.x));
                                  line.setAttribute('y2', String(data[end]!.y));
                                  line.setAttribute('stroke', '#00BFFF');
                                  line.setAttribute('stroke-width', '4');
                                  line.setAttribute('stroke-linecap', 'round');
                                  contentGroup.appendChild(line);
                              });
                              Object.entries(data).forEach(([key, pos]) => {
                                  if(!pos) return;
                                  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                                  circle.setAttribute('cx', String(pos.x));
                                  circle.setAttribute('cy', String(pos.y));
                                  circle.setAttribute('r', '6');
                                  circle.setAttribute('fill', key === 'head' ? '#FF4500' : '#FF00FF');
                                  contentGroup.appendChild(circle);
                              });
                          } else if (pose.type === 'image') {
                              const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
                              image.setAttribute('href', pose.href);
                              image.setAttribute('x', String(imgShape.x));
                              image.setAttribute('y', String(imgShape.y));
                              image.setAttribute('width', String(imgShape.width));
                              image.setAttribute('height', String(imgShape.height));
                              image.setAttribute('opacity', '0.8');
                              contentGroup.appendChild(image);
                          } else if (pose.type === 'drawing') {
                              const transformedPoints = pose.points.map(stroke =>
                                  stroke.map(p => ({
                                      x: imgShape.x + p.x * imgShape.width,
                                      y: imgShape.y + p.y * imgShape.height,
                                  }))
                              );
                              const pathData = transformedPoints.map(stroke => stroke.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ')).join(' ');
                              const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                              path.setAttribute('d', pathData);
                              path.setAttribute('fill', 'none');
                              path.setAttribute('stroke', 'red');
                              path.setAttribute('stroke-width', '3');
                              path.setAttribute('stroke-linecap', 'round');
                              path.setAttribute('stroke-linejoin', 'round');
                              path.setAttribute('opacity', '0.8');
                              contentGroup.appendChild(path);
                          }
                        }

                        if (character) {
                          const nameLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                          const bbox = getShapeBBox(imgShape);
                          nameLabel.setAttribute('x', String(bbox.x + bbox.width / 2));
                          nameLabel.setAttribute('y', String(bbox.y + bbox.height / 2));
                          nameLabel.setAttribute('font-size', '20');
                          nameLabel.setAttribute('font-weight', 'bold');
                          nameLabel.setAttribute('fill', 'white');
                          nameLabel.setAttribute('stroke', 'black');
                          nameLabel.setAttribute('stroke-width', '1');
                          nameLabel.setAttribute('paint-order', 'stroke');
                          nameLabel.setAttribute('text-anchor', 'middle');
                          nameLabel.setAttribute('dominant-baseline', 'central');
                          nameLabel.textContent = character.name;
                          contentGroup.appendChild(nameLabel);
                        }

                        if (imgShape.pose?.type === 'skeleton' && imgShape.pose.comment) {
                            const commentLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                            const bbox = getShapeBBox(imgShape);
                            commentLabel.setAttribute('x', String(bbox.x + bbox.width / 2));
                            commentLabel.setAttribute('y', String(bbox.y + bbox.height + 20));
                            commentLabel.setAttribute('font-size', '18');
                            commentLabel.setAttribute('font-weight', 'bold');
                            commentLabel.setAttribute('fill', 'green');
                            commentLabel.setAttribute('text-anchor', 'middle');
                            commentLabel.textContent = `(${imgShape.pose.comment})`;
                            contentGroup.appendChild(commentLabel);
                        }
                    });
                }
                
                 // Draw bubbles
                shapes.filter(s => s.type === 'bubble').forEach(shape => {
                    const bubble = shape as BubbleShape;
                    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    p.setAttribute('d', getBubblePath(bubble));
                    p.setAttribute('fill', 'white');
                    p.setAttribute('stroke', 'black');
                    p.setAttribute('stroke-width', '3');
                    contentGroup.appendChild(p);

                    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
                    fo.setAttribute('x', String(bubble.x + 10));
                    fo.setAttribute('y', String(bubble.y + 10));
                    fo.setAttribute('width', String(bubble.width - 20));
                    fo.setAttribute('height', String(bubble.height - 20));

                    const div = document.createElement('div');
                    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                    div.style.height = '100%';
                    div.style.overflow = 'hidden';
                    div.style.wordWrap = 'break-word';
                    div.style.fontSize = '20px';
                    div.style.lineHeight = '1.2';
                    div.style.fontFamily = 'sans-serif';
                    div.textContent = bubble.text;

                    fo.appendChild(div);
                    contentGroup.appendChild(fo);
                });

                // Draw standalone text
                shapes.filter(s => s.type === 'text').forEach(shape => {
                    const textShape = shape as TextShape;
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute('x', String(textShape.x));
                    text.setAttribute('y', String(textShape.y));
                    text.setAttribute('font-size', String(textShape.fontSize));
                    text.setAttribute('font-weight', 'bold');
                    text.setAttribute('fill', 'black');
                    text.setAttribute('text-anchor', 'start');
                    text.setAttribute('dominant-baseline', 'hanging');
                    text.style.fontFamily = 'sans-serif';
                    text.textContent = textShape.text;
                    contentGroup.appendChild(text);
                });

                tempSvg.appendChild(contentGroup);
                const svgData = new XMLSerializer().serializeToString(tempSvg);
                const canvas = document.createElement("canvas");
                canvas.width = canvasConfig.w;
                canvas.height = canvasConfig.h;
                const ctx = canvas.getContext("2d");
                if (!ctx) return reject("Canvas context not available");
                
                const img = new Image();
                img.onload = () => {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvasConfig.w, canvasConfig.h);
                    resolve(canvas.toDataURL("image/png"));
                    setSelectedShapeId(originalSelectedId);
                };
                img.onerror = () => {
                    reject("Failed to load SVG image");
                    setSelectedShapeId(originalSelectedId);
                }
                img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
            }, 50);
        });
    }
  }));
  
  const clearCanvas = () => onShapesChange([]);
  
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const characterId = e.dataTransfer.getData('characterId');
    const character = characters.find(c => c.id === characterId);
    if (!character) return;

    const dropPointWorld = getMousePos(e);

    const panels = shapes.filter(s => s.type === 'panel') as PanelShape[];
    let droppedOnPanelIndex = -1;

    for (let i = panels.length - 1; i >= 0; i--) {
        const p = panels[i];
        if (isPointInPolygon(dropPointWorld, p.points)) {
            droppedOnPanelIndex = i;
            break;
        }
    }

    if (droppedOnPanelIndex !== -1) {
        const charWidth = 150;
        const charHeight = 250;
        const charX = dropPointWorld.x - charWidth / 2;
        const charY = dropPointWorld.y - charHeight / 2;
        const newImageShape: ImageShape = {
            id: Date.now().toString(),
            type: 'image',
            href: character.sheetImage,
            characterId: character.id,
            panelIndex: droppedOnPanelIndex,
            x: charX,
            y: charY,
            width: charWidth,
            height: charHeight,
            pose: {
                type: 'skeleton',
                preset: 'full',
                data: createInitialSkeleton(charX, charY, charWidth, charHeight),
                comment: ''
            }
        };
        onShapesChange([...shapes, newImageShape]);
    } else {
        // You could add a temporary message here to guide the user
    }
  };
  
  const isPointInPolygon = (point: {x:number, y:number}, polygon: {x:number, y:number}[]) => {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
  };
  
  const addBubbleTail = (shapeId: string) => {
      onShapesChange(shapes.map(s => {
          if (s.id === shapeId && s.type === 'bubble') {
              const bbox = getShapeBBox(s);
              return {...s, tail: { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height + 30 } };
          }
          return s;
      }));
  }

  const removeBubbleTail = (shapeId: string) => {
    onShapesChange(shapes.map(s => (s.id === shapeId && s.type === 'bubble') ? {...s, tail: undefined} : s));
  };
  
  const openPoseEditor = (shape: ImageShape) => {
    setPosingCharacter(shape);
  };

  const savePose = (characterId: string, pose: Pose) => {
    onShapesChange(shapes.map(s => {
      if (s.id === characterId && s.type === 'image') {
        const originalShape = s as ImageShape;
        if (pose?.type === 'skeleton') {
            const modalCharBox = { x: 0, y: 0, w: 200, h: 400 }; // As defined in PoseEditorModal
            const newSkeletonData: SkeletonData = {};
            for (const key in pose.data) {
                const modalPoint = pose.data[key as keyof SkeletonData];
                if (!modalPoint) continue;
                newSkeletonData[key as keyof SkeletonData] = {
                    x: originalShape.x + (modalPoint.x - modalCharBox.x) / modalCharBox.w * originalShape.width,
                    y: originalShape.y + (modalPoint.y - modalCharBox.y) / modalCharBox.h * originalShape.height,
                };
            }
            return {...originalShape, pose: {...pose, data: newSkeletonData}};
        }
        return {...originalShape, pose};
      }
      return s;
    }));
    setPosingCharacter(null);
}

  const changeFontSize = (shapeId: string, amount: number) => {
      onShapesChange(shapes.map(s => {
          if (s.id === shapeId && s.type === 'text') {
              return {...s, fontSize: Math.max(8, s.fontSize + amount)};
          }
          return s;
      }));
  }
  
    const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            const img = new Image();
            img.onload = () => {
                const svg = svgRef.current;
                if (!svg) return;

                const { width: viewWidth, height: viewHeight } = svg.getBoundingClientRect();
                const viewCenterX = (viewWidth / 2 - viewTransform.x) / viewTransform.scale;
                const viewCenterY = (viewHeight / 2 - viewTransform.y) / viewTransform.scale;

                const defaultWidth = 200;
                const scale = defaultWidth / img.width;
                const defaultHeight = img.height * scale;

                const newImageShape: ImageShape = {
                    id: Date.now().toString(),
                    type: 'image',
                    href: base64,
                    characterId: 'user-upload',
                    panelIndex: -1,
                    x: viewCenterX - defaultWidth / 2,
                    y: viewCenterY - defaultHeight / 2,
                    width: defaultWidth,
                    height: defaultHeight,
                };
                onShapesChange([...shapes, newImageShape]);
            };
            img.src = base64;
        };
        reader.readAsDataURL(file);

        // Reset file input
        e.target.value = '';
    };


  const editingShape = shapes.find(s => s.id === editingShapeId);
  const editingShapeSVGPos = svgRef.current && editingShape ? (() => {
      const bbox = getShapeBBox(editingShape);
      const CTM = svgRef.current.getScreenCTM();
      if (!CTM) return { x: 0, y: 0, width: 0, height: 0, fontSize: 16 };
      const svgRect = svgRef.current.getBoundingClientRect();
      const scale = CTM.a; // Use CTM scale directly, viewTransform is handled by SVG
      
      const textShape = editingShape.type === 'text' ? editingShape as TextShape : null;
      const fontSize = textShape ? textShape.fontSize * viewTransform.scale * scale : 16 * viewTransform.scale * scale;

      return {
          x: svgRect.left + (bbox.x * viewTransform.scale + viewTransform.x) * scale,
          y: svgRect.top + (bbox.y * viewTransform.scale + viewTransform.y) * scale,
          width: bbox.width * viewTransform.scale * scale,
          height: bbox.height * viewTransform.scale * scale,
          fontSize
      }
  })() : null;
  
  const panels = shapes.filter(s => s.type === 'panel');

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const scaleFactor = 1.1;
      const newScale = e.deltaY < 0 ? viewTransform.scale * scaleFactor : viewTransform.scale / scaleFactor;
      const clampedScale = Math.max(0.1, Math.min(newScale, 10));
      
      const newX = mouseX - (mouseX - viewTransform.x) * (clampedScale / viewTransform.scale);
      const newY = mouseY - (mouseY - viewTransform.y) * (clampedScale / viewTransform.scale);

      onViewTransformChange({ scale: clampedScale, x: newX, y: newY });
  };
  
    const handleTooltipShow = (e: React.MouseEvent<HTMLButtonElement>, text: string) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({
            text,
            x: rect.right + 10,
            y: rect.top + rect.height / 2 - 14,
        });
    };

    const handleTooltipHide = () => {
        setTooltip(null);
    };

    const zoom = (direction: 'in' | 'out') => {
        const svg = svgRef.current;
        if (!svg) return;
        const { width: viewWidth, height: viewHeight } = svg.getBoundingClientRect();
        const centerX = viewWidth / 2;
        const centerY = viewHeight / 2;

        const scaleFactor = 1.25;
        const newScale = direction === 'in' ? viewTransform.scale * scaleFactor : viewTransform.scale / scaleFactor;
        const clampedScale = Math.max(0.1, Math.min(newScale, 10));

        const newX = centerX - (centerX - viewTransform.x) * (clampedScale / viewTransform.scale);
        const newY = centerY - (centerY - viewTransform.y) * (clampedScale / viewTransform.scale);
        onViewTransformChange({ scale: clampedScale, x: newX, y: newY });
    };
    const zoomIn = () => zoom('in');
    const zoomOut = () => zoom('out');

    const shapeOrder = useMemo(() => ({
        panel: 10,
        drawing: 20,
        arrow: 25,
        image: 30, // Characters
        bubble: 40,
        text: 50, // Text on top
    }), []);
    const sortedShapes = useMemo(() => [...shapes].sort((a, b) => (shapeOrder[a.type] || 99) - (shapeOrder[b.type] || 99)), [shapes, shapeOrder]);

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm h-full flex flex-col relative" onDragOver={handleDragOver} onDrop={handleDrop}>
        <input type="file" ref={imageUploadRef} onChange={handleImageFileSelect} accept="image/png, image/jpeg, image/webp" className="hidden"/>
        {tooltip && (
            <div style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, zIndex: 100 }} className="bg-gray-800 text-white text-xs px-2 py-1 rounded-md shadow-lg pointer-events-none transition-opacity duration-150">
                {tooltip.text}
            </div>
        )}
        {isDraggingCharacter && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none rounded-xl">
                <p className="text-white text-2xl font-bold bg-indigo-600/80 px-6 py-3 rounded-lg">{t('dropCharacterOnPanel')}</p>
            </div>
        )}
        {posingCharacter && <PoseEditorModal character={posingCharacter} onSave={savePose} onClose={() => setPosingCharacter(null)} />}
        {editingShapeId && editingShape && editingShapeSVGPos && (
             <textarea ref={textEditRef} value={editingShape.text} onChange={(e) => onShapesChange(shapes.map(s => s.id === editingShapeId ? {...s, text: e.target.value} : s), false)} onBlur={() => { onShapesChange(shapes, true); setEditingShapeId(null); } } onKeyDown={(e) => e.key === 'Enter' && e.shiftKey ? null : e.key === 'Escape' || e.key === 'Enter' ? setEditingShapeId(null) : null} className="absolute z-50 p-2 border-2 border-indigo-500 rounded-md bg-white resize-none shadow-lg" style={{ left: `${editingShapeSVGPos.x}px`, top: `${editingShapeSVGPos.y}px`, width: `${editingShapeSVGPos.width}px`, height: `${editingShapeSVGPos.height}px`, fontFamily: 'sans-serif', fontSize: `${editingShapeSVGPos.fontSize}px`, lineHeight: 1.2, outline: 'none' }}/>
        )}
        <div className="flex justify-between items-center mb-4 px-2">
            <h2 className="text-lg font-semibold text-gray-700">{t('createVisualLayout')}</h2>
            <button onClick={onToggleFullscreen} className="p-2 rounded-full hover:bg-gray-200" onMouseEnter={(e) => handleTooltipShow(e, isFullscreen ? t('fullscreenExit') : t('fullscreenEnter'))} onMouseLeave={handleTooltipHide}>
                {isFullscreen ? <ShrinkIcon className="w-5 h-5" /> : <ExpandIcon className="w-5 h-5" />}
            </button>
        </div>
      <div className="flex-grow w-full h-full flex items-start justify-center gap-4 bg-gray-100 rounded-lg overflow-hidden p-4 relative">
        {/* Toolbar */}
        <div className="bg-white shadow-lg rounded-full border border-gray-200 p-2 flex flex-col items-center gap-1 z-10">
            <button onClick={onUndo} disabled={!canUndo} className="p-3 rounded-full hover:bg-gray-200 text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed" onMouseEnter={(e) => handleTooltipShow(e, t('undo'))} onMouseLeave={handleTooltipHide}><UndoIcon className="w-5 h-5"/></button>
            <button onClick={onRedo} disabled={!canRedo} className="p-3 rounded-full hover:bg-gray-200 text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed" onMouseEnter={(e) => handleTooltipShow(e, t('redo'))} onMouseLeave={handleTooltipHide}><RedoIcon className="w-5 h-5"/></button>
            <div className="w-8 h-px bg-gray-300 my-1"></div>
            <button onClick={() => { setActiveTool('select'); }} className={`p-3 rounded-full ${activeTool === 'select' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('selectAndMove'))} onMouseLeave={handleTooltipHide}><SelectIcon className="w-5 h-5"/></button>
            <button onClick={() => setActiveTool('pan')} className={`p-3 rounded-full ${activeTool === 'pan' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('panCanvas'))} onMouseLeave={handleTooltipHide}><HandIcon className="w-5 h-5"/></button>
            <div className="w-8 h-px bg-gray-300 my-1"></div>
            <button onClick={() => setActiveTool('panel')} className={`p-3 rounded-full ${activeTool === 'panel' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('drawPanel'))} onMouseLeave={handleTooltipHide}><PolygonIcon className="w-5 h-5"/></button>
            <button onClick={() => setActiveTool('text')} className={`p-3 rounded-full ${activeTool === 'text' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('addText'))} onMouseLeave={handleTooltipHide}><TextToolIcon className="w-5 h-5"/></button>
            <button onClick={() => setActiveTool('draw')} className={`p-3 rounded-full ${activeTool === 'draw' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('drawFreehand'))} onMouseLeave={handleTooltipHide}><BrushIcon className="w-5 h-5"/></button>
            <button onClick={() => setActiveTool('arrow')} className={`p-3 rounded-full ${activeTool === 'arrow' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('drawArrow'))} onMouseLeave={handleTooltipHide}><ArrowIcon className="w-5 h-5"/></button>
            <button onClick={() => imageUploadRef.current?.click()} className="p-3 rounded-full hover:bg-gray-200 text-gray-700" onMouseEnter={(e) => handleTooltipShow(e, t('uploadPose'))} onMouseLeave={handleTooltipHide}><UploadIcon className="w-5 h-5"/></button>
            
            <div className="w-8 h-px bg-gray-300 my-1"></div>
            
            <div className="flex flex-col items-center gap-1 bg-gray-100 rounded-full p-1">
                <button onClick={() => {setActiveTool('bubble'); setActiveBubbleType('rounded')}} className={`p-2 rounded-full ${activeTool === 'bubble' && activeBubbleType === 'rounded' ? 'bg-indigo-500 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('roundedBubble'))} onMouseLeave={handleTooltipHide}><BubbleToolIcon className="w-5 h-5"/></button>
                <button onClick={() => {setActiveTool('bubble'); setActiveBubbleType('oval')}} className={`p-2 rounded-full ${activeTool === 'bubble' && activeBubbleType === 'oval' ? 'bg-indigo-500 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('ovalBubble'))} onMouseLeave={handleTooltipHide}><CircleIcon className="w-5 h-5"/></button>
                <button onClick={() => {setActiveTool('bubble'); setActiveBubbleType('rect')}} className={`p-2 rounded-full ${activeTool === 'bubble' && activeBubbleType === 'rect' ? 'bg-indigo-500 text-white' : 'hover:bg-gray-200 text-gray-700'}`} onMouseEnter={(e) => handleTooltipShow(e, t('rectangularBubble'))} onMouseLeave={handleTooltipHide}><SquareIcon className="w-5 h-5"/></button>
            </div>

            <div className="w-8 h-px bg-gray-300 my-1"></div>
            <button onClick={clearCanvas} className="p-3 rounded-full hover:bg-red-500 hover:text-white text-gray-700" onMouseEnter={(e) => handleTooltipShow(e, t('clearCanvas'))} onMouseLeave={handleTooltipHide}><TrashIcon className="w-5 h-5"/></button>
        </div>
        
        {/* Brush Controls */}
        {(activeTool === 'draw' || activeTool === 'arrow') && (
            <div className="absolute top-6 left-24 z-10 bg-white shadow-lg rounded-lg border border-gray-200 p-2 flex items-center gap-3 animate-fade-in">
                <label htmlFor="brush-color" className="text-sm font-medium text-gray-700">{t('brushColor')}</label>
                <input id="brush-color" type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-white" style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }} />
                <label htmlFor="brush-size" className="text-sm font-medium text-gray-700 ml-2">{t('brushSize')}</label>
                <div className="flex items-center gap-2">
                    <input id="brush-size" type="range" min="1" max="50" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-24" />
                    <span className="text-sm w-6 text-center font-semibold text-gray-600">{brushSize}</span>
                </div>
            </div>
        )}

        {/* Canvas */}
        <div className="w-full h-full relative" onWheel={handleWheel}>
            <svg
                ref={svgRef} width="100%" height="100%"
                className={`${isSpacePressed.current || action.type === 'panning' ? 'cursor-grabbing' : activeTool === 'pan' ? 'cursor-grab' : 'cursor-default'}`}
                style={{ cursor: (activeTool === 'draw' || activeTool === 'arrow') ? 'none' : (isSpacePressed.current || action.type === 'panning' ? 'grabbing' : activeTool === 'pan' ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair')}}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(null as any); setCursorPreview(null); }}
            >
                <defs>
                  <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#FF0000" />
                  </marker>
                   <marker id="arrowhead-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(128, 90, 213, 1)" />
                  </marker>
                </defs>
                <g className="canvas-content" transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}>
                    {proposalImage && (
                         <image 
                            href={proposalImage}
                            x="0" y="0"
                            width={canvasConfig.w} height={canvasConfig.h}
                            opacity={isProposalVisible ? proposalOpacity : 0}
                            style={{ pointerEvents: 'none' }}
                         />
                    )}
                    <rect 
                        id="canvas-background-rect"
                        x="0" y="0" 
                        width={canvasConfig.w} height={canvasConfig.h} 
                        fill={proposalImage ? 'transparent' : 'white'}
                        stroke="rgba(0,0,0,0.15)" strokeWidth="1" vectorEffect="non-scaling-stroke"
                        style={{
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                        }}
                    />
                     {drawingGuideRect && (
                        <rect
                            x={drawingGuideRect.x}
                            y={drawingGuideRect.y}
                            width={drawingGuideRect.width}
                            height={drawingGuideRect.height}
                            fill="none"
                            stroke="rgba(128, 90, 213, 0.5)"
                            strokeWidth={2 / viewTransform.scale}
                            strokeDasharray={`${4 / viewTransform.scale}`}
                            pointerEvents="none"
                        />
                     )}
                {sortedShapes.map((shape) => {
                    const isSelected = selectedShapeId === shape.id;
                    const panelIndex = shape.type === 'panel' ? panels.findIndex(p => p.id === shape.id) : -1;
                    const bbox = getShapeBBox(shape);
                    const isDrawingToolActive = activeTool === 'panel' || activeTool === 'bubble' || activeTool === 'draw' || activeTool === 'arrow';
                    
                    return (
                        <g 
                            key={shape.id} 
                            data-shape-type={shape.type} 
                            onMouseDown={(e) => handleShapeInteraction(e, shape, 'shape')} 
                            onDoubleClick={(e) => handleShapeDoubleClick(e, shape)} 
                            style={{ 
                                cursor: activeTool === 'select' ? 'move' : 'default',
                                pointerEvents: isDrawingToolActive ? 'none' : 'auto'
                            }}
                        >
                            {shape.type === 'panel' && (
                                <>
                                <polygon points={shape.points.map(p => `${p.x},${p.y}`).join(' ')} fill="rgba(128, 90, 213, 0.1)" stroke="rgba(128, 90, 213, 0.8)" strokeWidth={isSelected ? 4/viewTransform.scale : 2/viewTransform.scale} onMouseDown={(e) => handleShapeInteraction(e, shape, 'shape')} />
                                {isSelected && activeTool === 'select' && (
                                    <>
                                        {shape.points.map((p, i) => (
                                            <circle key={i} cx={p.x} cy={p.y} r={6/viewTransform.scale} fill="white" stroke="rgba(128, 90, 213, 1)" strokeWidth={2/viewTransform.scale} cursor="move" onMouseDown={(e) => handleShapeInteraction(e, shape, 'panelVertex', i)} />
                                        ))}
                                        {shape.points.map((p1, i) => {
                                            const p2 = shape.points[(i + 1) % shape.points.length];
                                            const midX = (p1.x + p2.x) / 2;
                                            const midY = (p1.y + p2.y) / 2;
                                            return <circle key={`edge-${i}`} cx={midX} cy={midY} r={5/viewTransform.scale} fill="rgba(128, 90, 213, 1)" cursor="copy" onMouseDown={(e) => handleAddPanelVertex(e, shape, i)} />
                                        })}
                                    </>
                                )}
                                {panelIndex !== -1 && (
                                    <text x={getPolygonCentroid(shape.points).x} y={getPolygonCentroid(shape.points).y} fontSize={60/viewTransform.scale} fontWeight="bold" fill="rgba(0,0,0,0.1)" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{panelIndex + 1}</text>
                                )}
                                </>
                            )}
                            {shape.type === 'text' && (
                                <>
                                    {/* Transparent rect for hit detection */}
                                    <rect
                                        x={bbox.x}
                                        y={bbox.y}
                                        width={bbox.width}
                                        height={bbox.height}
                                        fill="transparent"
                                    />
                                    <text
                                        x={shape.x} y={shape.y}
                                        fontSize={shape.fontSize}
                                        fill="black"
                                        style={{ fontFamily: 'sans-serif', userSelect: 'none', WebkitUserSelect: 'none' }}
                                        pointerEvents="none"
                                        dominantBaseline="hanging"
                                    >
                                        {shape.text}
                                    </text>
                                    {isSelected && (
                                        <>
                                            <rect x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} fill="none" stroke="rgba(128, 90, 213, 1)" strokeWidth={1 / viewTransform.scale} strokeDasharray={`${4/viewTransform.scale}`} pointerEvents="none" />
                                            <g transform={`translate(${bbox.x + bbox.width}, ${bbox.y + bbox.height})`}>
                                                <rect x={-5/viewTransform.scale} y={-5/viewTransform.scale} width={10/viewTransform.scale} height={10/viewTransform.scale} fill="white" stroke="rgba(128, 90, 213, 1)" strokeWidth={1.5/viewTransform.scale} cursor="se-resize" onMouseDown={(e) => handleShapeInteraction(e, shape, 'resize', 'bottom-right')} />
                                            </g>
                                            <foreignObject x={bbox.x - 30/viewTransform.scale} y={bbox.y + bbox.height/2 - 25/viewTransform.scale} width={25/viewTransform.scale} height={50/viewTransform.scale}>
                                                <div className="flex flex-col h-full justify-around items-center">
                                                    <button onMouseDown={(e) => e.stopPropagation()} onClick={() => changeFontSize(shape.id, 2)} className="p-0.5 bg-white rounded-full shadow border hover:bg-gray-100 flex items-center justify-center">
                                                        <PlusIcon className="w-4 h-4" />
                                                    </button>
                                                     <button onMouseDown={(e) => e.stopPropagation()} onClick={() => changeFontSize(shape.id, -2)} className="p-0.5 bg-white rounded-full shadow border hover:bg-gray-100 flex items-center justify-center">
                                                        <MinusIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </foreignObject>
                                        </>
                                    )}
                                </>
                            )}
                            {shape.type === 'bubble' && (
                                <>
                                    <path d={getBubblePath(shape)} fill="white" stroke="black" strokeWidth={2 / viewTransform.scale} />
                                    <foreignObject x={shape.x + 10} y={shape.y + 10} width={shape.width - 20} height={shape.height - 20} pointerEvents="none">
                                        <div style={{ height: '100%', overflow: 'hidden', wordWrap: 'break-word', fontSize: '20px', lineHeight: '1.2', fontFamily: 'sans-serif' }}>
                                            {shape.text}
                                        </div>
                                    </foreignObject>
                                    {isSelected && (
                                        <>
                                            <rect x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} fill="none" stroke="rgba(128, 90, 213, 1)" strokeWidth={1 / viewTransform.scale} strokeDasharray={`${4/viewTransform.scale}`} />
                                            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(handle => {
                                                const x = handle.includes('right') ? bbox.x + bbox.width : bbox.x;
                                                const y = handle.includes('bottom') ? bbox.y + bbox.height : bbox.y;
                                                return <rect key={handle} x={x-5/viewTransform.scale} y={y-5/viewTransform.scale} width={10/viewTransform.scale} height={10/viewTransform.scale} fill="white" stroke="rgba(128, 90, 213, 1)" strokeWidth={1.5/viewTransform.scale} cursor={`${handle.split('-')[1].startsWith('e') ? 'ew' : 'ns'}-resize`} onMouseDown={(e) => handleShapeInteraction(e, shape, 'resize', handle)} />
                                            })}
                                            {shape.tail && (
                                                <circle cx={shape.tail.x} cy={shape.tail.y} r={6/viewTransform.scale} fill="white" stroke="rgba(128, 90, 213, 1)" strokeWidth={2/viewTransform.scale} cursor="move" onMouseDown={(e) => handleShapeInteraction(e, shape, 'tail')} />
                                            )}
                                            <foreignObject x={bbox.x + bbox.width / 2 - 50 / viewTransform.scale} y={bbox.y - 30 / viewTransform.scale} width={100/viewTransform.scale} height={25/viewTransform.scale}>
                                                <div className="flex justify-center items-center gap-1">
                                                    <button onClick={() => shape.tail ? removeBubbleTail(shape.id) : addBubbleTail(shape.id)} className="p-1 bg-white rounded-md shadow border hover:bg-gray-100">
                                                        <BubbleToolIcon className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => deleteShape(shape.id)} className="p-1 bg-white rounded-md shadow border hover:bg-gray-100">
                                                        <TrashIcon className="w-4 h-4 text-red-500"/>
                                                    </button>
                                                </div>
                                            </foreignObject>
                                        </>
                                    )}
                                </>
                            )}
                            {shape.type === 'drawing' && (
                                <path d={getDrawingPath(shape)} fill="none" stroke={shape.strokeColor} strokeWidth={shape.strokeWidth / viewTransform.scale} strokeLinecap="round" strokeLinejoin="round" />
                            )}
                             {shape.type === 'arrow' && (
                                <>
                                <line
                                    x1={shape.points[0].x} y1={shape.points[0].y}
                                    x2={shape.points[1].x} y2={shape.points[1].y}
                                    stroke={isSelected ? 'rgba(128, 90, 213, 1)' : shape.strokeColor}
                                    strokeWidth={(isSelected ? Math.max(shape.strokeWidth, 4) : shape.strokeWidth) / viewTransform.scale}
                                    strokeLinecap="round"
                                    markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
                                />
                                {isSelected && (
                                    <>
                                        <circle cx={shape.points[0].x} cy={shape.points[0].y} r={8/viewTransform.scale} fill="white" stroke="rgba(128, 90, 213, 1)" strokeWidth={2/viewTransform.scale} cursor="move" onMouseDown={(e) => handleShapeInteraction(e, shape, 'arrowHandle', 0)} />
                                        <circle cx={shape.points[1].x} cy={shape.points[1].y} r={8/viewTransform.scale} fill="white" stroke="rgba(128, 90, 213, 1)" strokeWidth={2/viewTransform.scale} cursor="move" onMouseDown={(e) => handleShapeInteraction(e, shape, 'arrowHandle', 1)} />
                                    </>
                                )}
                                </>
                            )}
                            {shape.type === 'image' && (
                                <>
                                    <image href={shape.href} x={shape.x} y={shape.y} width={shape.width} height={shape.height} style={{ imageRendering: 'pixelated' }} />
                                    {renderPose(shape)}
                                     {(() => {
                                        const character = characters.find(c => c.id === shape.characterId);
                                        if (!character) return null;
                                        return (
                                            <g pointerEvents="none">
                                                <text
                                                    x={bbox.x + bbox.width / 2}
                                                    y={bbox.y + bbox.height / 2}
                                                    fontSize={20 / viewTransform.scale}
                                                    fontWeight="bold"
                                                    fill="white"
                                                    stroke="black"
                                                    strokeWidth={1 / viewTransform.scale}
                                                    paintOrder="stroke"
                                                    textAnchor="middle"
                                                    dominantBaseline="central"
                                                    style={{ userSelect: 'none' }}
                                                >
                                                    {character.name}
                                                </text>
                                            </g>
                                        );
                                    })()}
                                    {isSelected && (
                                        <>
                                            <rect x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} fill="none" stroke="rgba(128, 90, 213, 1)" strokeWidth={2 / viewTransform.scale} strokeDasharray={`${4/viewTransform.scale}`} />
                                             {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(handle => {
                                                const x = handle.includes('right') ? bbox.x + bbox.width : bbox.x;
                                                const y = handle.includes('bottom') ? bbox.y + bbox.height : bbox.y;
                                                return <rect key={handle} x={x-5/viewTransform.scale} y={y-5/viewTransform.scale} width={10/viewTransform.scale} height={10/viewTransform.scale} fill="white" stroke="rgba(128, 90, 213, 1)" strokeWidth={1.5/viewTransform.scale} cursor={`${handle.startsWith('top') || handle.startsWith('bottom') ? 'ns' : 'ew'}-resize`} onMouseDown={(e) => handleShapeInteraction(e, shape, 'resize', handle)} />
                                            })}
                                            <foreignObject x={bbox.x + bbox.width / 2 - 50 / viewTransform.scale} y={bbox.y - 30 / viewTransform.scale} width={100/viewTransform.scale} height={25/viewTransform.scale}>
                                                <div className="flex justify-center items-center gap-1">
                                                    <button onClick={() => openPoseEditor(shape)} className="p-1 bg-white rounded-md shadow border hover:bg-gray-100">
                                                        <EditPoseIcon className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => deleteShape(shape.id)} className="p-1 bg-white rounded-md shadow border hover:bg-gray-100">
                                                        <TrashIcon className="w-4 h-4 text-red-500"/>
                                                    </button>
                                                </div>
                                            </foreignObject>
                                        </>
                                    )}
                                </>
                            )}
                        </g>
                    )
                })}
                </g>
                {cursorPreview && (activeTool === 'draw' || activeTool === 'arrow') && (
                    <circle 
                        cx={cursorPreview.x * viewTransform.scale + viewTransform.x} 
                        cy={cursorPreview.y * viewTransform.scale + viewTransform.y} 
                        r={brushSize / 2} 
                        fill="none" 
                        stroke={activeTool === 'arrow' ? '#FF0000' : brushColor} 
                        strokeWidth="1.5" 
                        strokeDasharray="2 2"
                        pointerEvents="none" 
                    />
                )}
            </svg>
        </div>
         {/* Zoom & Proposal Controls */}
        <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-3">
             {proposalImage && (
                <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-2 flex flex-col gap-2 animate-fade-in">
                    <div className="flex items-center justify-between text-sm font-medium text-gray-700 px-1">
                        <span>{t('assistantGuide')}</span>
                         <button onClick={() => onProposalSettingsChange({ isProposalVisible: !isProposalVisible })} className="p-1 rounded-full hover:bg-gray-200">
                            {isProposalVisible ? <EyeIcon className="w-4 h-4"/> : <EyeOffIcon className="w-4 h-4"/>}
                        </button>
                    </div>
                    {isProposalVisible && (
                       <>
                        <div className="flex items-center gap-2">
                             <span className="text-xs font-medium text-gray-500">{t('opacity')}</span>
                             <input type="range" min="0" max="1" step="0.05" value={proposalOpacity} onChange={(e) => onProposalSettingsChange({ proposalOpacity: parseFloat(e.target.value) })} className="w-24" />
                        </div>
                        <button onClick={onApplyLayout} className="w-full text-xs font-semibold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-md py-1.5">{t('applyLayout')}</button>
                       </>
                    )}
                </div>
             )}
            <div className="bg-white shadow-lg rounded-full border border-gray-200 p-1 flex items-center gap-1">
                <button onClick={zoomOut} className="p-2 rounded-full hover:bg-gray-200 text-gray-700" onMouseEnter={(e) => handleTooltipShow(e, t('zoomOut'))} onMouseLeave={handleTooltipHide}><MinusIcon className="w-5 h-5"/></button>
                <button onClick={fitAndCenterCanvas} className="p-2 rounded-full hover:bg-gray-200 text-gray-700 text-xs font-semibold" onMouseEnter={(e) => handleTooltipShow(e, t('fitToScreen'))} onMouseLeave={handleTooltipHide}>{Math.round(viewTransform.scale * 100)}%</button>
                <button onClick={zoomIn} className="p-2 rounded-full hover:bg-gray-200 text-gray-700" onMouseEnter={(e) => handleTooltipShow(e, t('zoomIn'))} onMouseLeave={handleTooltipHide}><PlusIcon className="w-5 h-5"/></button>
            </div>
        </div>

      </div>
    </div>
  );
});