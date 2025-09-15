import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ImageShape, Pose, SkeletonData, SkeletonPose } from '../types';
import { useLocalization } from '../hooks/useLocalization';
import { XIcon, UploadIcon, BrushIcon, TrashIcon, RedoIcon, EditPoseIcon } from './icons';

interface PoseEditorModalProps {
  character: ImageShape;
  onSave: (id: string, pose: Pose) => void;
  onClose: () => void;
}

const MODAL_WIDTH = 200;
const MODAL_HEIGHT = 400;

const createInitialSkeleton = (x: number, y: number, width: number, height: number): SkeletonData => {
    const centerX = x + width / 2;
    const topY = y + height * 0.15;
    const hipY = y + height * 0.5;
    const armY = y + height * 0.3;
    const legY = y + height * 0.9;
    const shoulderWidth = width * 0.2;
    const hipWidth = width * 0.15;
    const eyeY = topY - height * 0.03;
    const eyeDistX = width * 0.07;
    const noseY = topY;
    const mouthY = topY + height * 0.05;

    return {
        head: { x: centerX, y: topY }, neck: { x: centerX, y: armY },
        leftShoulder: { x: centerX - shoulderWidth, y: armY }, rightShoulder: { x: centerX + shoulderWidth, y: armY },
        leftElbow: { x: centerX - shoulderWidth * 1.5, y: hipY }, rightElbow: { x: centerX + shoulderWidth * 1.5, y: hipY },
        leftHand: { x: centerX - shoulderWidth * 1.2, y: legY - height * 0.1 }, rightHand: { x: centerX + shoulderWidth * 1.2, y: legY - height * 0.1 },
        hips: { x: centerX, y: hipY }, leftHip: { x: centerX - hipWidth, y: hipY }, rightHip: { x: centerX + hipWidth, y: hipY },
        leftKnee: { x: centerX - hipWidth, y: hipY + height * 0.2 }, rightKnee: { x: centerX + hipWidth, y: hipY + 0.2 },
        leftFoot: { x: centerX - hipWidth, y: legY }, rightFoot: { x: centerX + hipWidth, y: legY },
        leftEye: { x: centerX - eyeDistX, y: eyeY }, rightEye: { x: centerX + eyeDistX, y: eyeY },
        nose: { x: centerX, y: noseY }, mouth: { x: centerX, y: mouthY },
    };
};

const allJointKeys = Object.keys(createInitialSkeleton(0, 0, 0, 0));

const presetJoints: Record<SkeletonPose['preset'], string[]> = {
    face: ['head', 'leftEye', 'rightEye', 'nose', 'mouth'],
    upper: ['head', 'neck', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftHand', 'rightHand', 'hips', 'leftEye', 'rightEye', 'nose', 'mouth'],
    lower: ['hips', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftFoot', 'rightFoot'],
    full: allJointKeys,
};

const skeletonConnections = [
    ['head', 'neck'], ['neck', 'leftShoulder'], ['neck', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftHand'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightHand'],
    ['neck', 'hips'],
    ['hips', 'leftHip'], ['hips', 'rightHip'],
    ['leftHip', 'leftKnee'], ['leftKnee', 'leftFoot'],
    ['rightHip', 'rightKnee'], ['rightKnee', 'rightFoot'],
    ['leftEye', 'rightEye'], ['nose', 'mouth'],
];

export function PoseEditorModal({ character, onSave, onClose }: PoseEditorModalProps) {
    const { t } = useLocalization();
    const [activeTab, setActiveTab] = useState<'skeleton' | 'upload' | 'draw'>('skeleton');
    
    const [skeletonPose, setSkeletonPose] = useState<SkeletonPose>(() => {
        if (character.pose?.type === 'skeleton') return { ...character.pose, preset: character.pose.preset || 'full' };
        const initialData = createInitialSkeleton(0, 0, MODAL_WIDTH, MODAL_HEIGHT);
        return { type: 'skeleton', preset: 'full', data: initialData, comment: '' };
    });
    const [draggingJoint, setDraggingJoint] = useState<string | null>(null);

    const [uploadedImage, setUploadedImage] = useState<string | null>(character.pose?.type === 'image' ? character.pose.href : null);
    const uploadRef = useRef<HTMLInputElement>(null);

    const drawCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawingPoints, setDrawingPoints] = useState<{x: number, y: number}[][]>(character.pose?.type === 'drawing' ? character.pose.points.map(stroke => stroke.map(p => ({ x: p.x * MODAL_WIDTH, y: p.y * MODAL_HEIGHT }))) : []);
    const [drawColor, setDrawColor] = useState('#FF0000');
    const [drawSize, setDrawSize] = useState(5);


    useEffect(() => {
        if (character.pose?.type === 'skeleton') {
            const charBox = { x: character.x, y: character.y, w: character.width, h: character.height };
            const modalBox = { x: 0, y: 0, w: MODAL_WIDTH, h: MODAL_HEIGHT };
            const newSkeletonData: SkeletonData = {};
            const defaultSkeleton = createInitialSkeleton(0, 0, 0, 0); // To get all keys
            for (const key in defaultSkeleton) {
                const charPoint = character.pose.data[key as keyof SkeletonData];
                if (charPoint) {
                    newSkeletonData[key as keyof SkeletonData] = {
                        x: modalBox.x + (charPoint.x - charBox.x) / charBox.w * modalBox.w,
                        y: modalBox.y + (charPoint.y - charBox.y) / charBox.h * modalBox.h,
                    };
                }
            }
            setSkeletonPose({ ...character.pose, data: newSkeletonData, preset: character.pose.preset || 'full' });
        }
    }, [character]);

    const handleSave = () => {
        let pose: Pose | null = null;
        if (activeTab === 'skeleton') {
            pose = skeletonPose;
        } else if (activeTab === 'upload' && uploadedImage) {
            pose = { type: 'image', href: uploadedImage };
        } else if (activeTab === 'draw' && drawingPoints.length > 0) {
            const normalizedPoints = drawingPoints.map(stroke => 
                stroke.map(p => ({
                    x: p.x / MODAL_WIDTH,
                    y: p.y / MODAL_HEIGHT,
                }))
            );
            pose = { type: 'drawing', points: normalizedPoints };
        }
        if (pose) {
            onSave(character.id, pose);
        }
    };
    
    const handleSkeletonMouseDown = (joint: string) => setDraggingJoint(joint);
    const handleSkeletonMouseMove = (e: React.MouseEvent) => {
        if (!draggingJoint) return;
        const svg = e.currentTarget as SVGSVGElement;
        const rect = svg.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, MODAL_WIDTH));
        const y = Math.max(0, Math.min(e.clientY - rect.top, MODAL_HEIGHT));
        setSkeletonPose(prev => ({ ...prev, data: { ...prev.data, [draggingJoint]: { x, y } } }));
    };
    const resetSkeleton = () => {
        setSkeletonPose(prev => ({...prev, data: createInitialSkeleton(0,0,MODAL_WIDTH, MODAL_HEIGHT)}));
    };
    
    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => setUploadedImage(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const getDrawCoords = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = drawCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        setIsDrawing(true);
        const pos = getDrawCoords(e);
        if (pos) {
            setDrawingPoints(prev => [...prev, [pos]]);
        }
    };
    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (!isDrawing) return;
        const pos = getDrawCoords(e);
        if(pos) {
            setDrawingPoints(prev => {
                const newPoints = [...prev];
                newPoints[newPoints.length - 1].push(pos);
                return newPoints;
            });
        }
    };
    useEffect(() => {
        const canvas = drawCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            ctx.clearRect(0,0, canvas.width, canvas.height);
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = drawSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawingPoints.forEach(stroke => {
                ctx.beginPath();
                stroke.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
                ctx.stroke();
            });
        }
    }, [drawingPoints, drawColor, drawSize]);

    const visibleJoints = useMemo(() => new Set(presetJoints[skeletonPose.preset || 'full']), [skeletonPose.preset]);
    const visibleConnections = useMemo(() => skeletonConnections.filter(([start, end]) => visibleJoints.has(start) && visibleJoints.has(end)), [visibleJoints]);

    const tabs = [
        { id: 'skeleton', name: t('skeleton'), icon: EditPoseIcon },
        { id: 'upload', name: t('uploadPose'), icon: UploadIcon },
        { id: 'draw', name: t('drawPose'), icon: BrushIcon },
    ];
    
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                 <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{t('editCharacterPose')}</h3>
                        <p className="text-sm text-gray-500">{t('editCharacterPoseDesc')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><XIcon className="w-5 h-5 text-gray-600" /></button>
                </div>

                <div className="p-4 flex gap-4 flex-grow min-h-0">
                    <div className="flex-grow bg-gray-100 rounded-lg flex items-center justify-center relative aspect-[1/2]">
                        {activeTab === 'skeleton' && (
                             <svg width={MODAL_WIDTH} height={MODAL_HEIGHT} onMouseMove={handleSkeletonMouseMove} onMouseUp={() => setDraggingJoint(null)} onMouseLeave={() => setDraggingJoint(null)}>
                                {visibleConnections.map(([start, end]) => {
                                    if (!skeletonPose.data[start] || !skeletonPose.data[end]) return null;
                                    return <line key={`${start}-${end}`} x1={skeletonPose.data[start].x} y1={skeletonPose.data[start].y} x2={skeletonPose.data[end].x} y2={skeletonPose.data[end].y} stroke="#00BFFF" strokeWidth={4} strokeLinecap='round'/>
                                })}
                                {Object.entries(skeletonPose.data).filter(([key]) => visibleJoints.has(key)).map(([key, pos]) => {
                                    if (!pos) return null;
                                    return <circle key={key} cx={pos.x} cy={pos.y} r={8} fill={key === 'head' ? '#FF4500' : '#FF00FF'} stroke="white" strokeWidth={2} onMouseDown={() => handleSkeletonMouseDown(key)} className="cursor-grab active:cursor-grabbing" />
                                })}
                            </svg>
                        )}
                        {activeTab === 'upload' && (
                            <div className="w-full h-full flex items-center justify-center">
                                {uploadedImage ? <img src={uploadedImage} className="max-w-full max-h-full object-contain" /> : <p className="text-gray-500">{t('uploadPosePrompt')}</p>}
                            </div>
                        )}
                        {activeTab === 'draw' && (
                            <canvas ref={drawCanvasRef} width={MODAL_WIDTH} height={MODAL_HEIGHT} className="cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)} onMouseLeave={() => setIsDrawing(false)} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => setIsDrawing(false)} />
                        )}
                    </div>
                    <div className="w-64 flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            {tabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-3 p-2 rounded-md text-sm font-semibold ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                                    <tab.icon className="w-5 h-5" />
                                    {tab.name}
                                </button>
                            ))}
                        </div>
                        <div className="border-t border-gray-200 pt-4 flex-grow flex flex-col gap-4">
                            {activeTab === 'skeleton' && (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">{t('posePreset')}</label>
                                        <select value={skeletonPose.preset} onChange={e => setSkeletonPose(p => ({...p, preset: e.target.value as any}))} className="w-full mt-1 p-2 bg-white border border-gray-300 rounded-md text-sm">
                                            <option value="full">{t('fullBody')}</option>
                                            <option value="upper">{t('upperBody')}</option>
                                            <option value="lower">{t('lowerBody')}</option>
                                            <option value="face">{t('face')}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">{t('poseComment')}</label>
                                        <input type="text" value={skeletonPose.comment} onChange={e => setSkeletonPose(p => ({...p, comment: e.target.value}))} placeholder={t('poseCommentPlaceholder')} className="w-full mt-1 p-2 bg-white border border-gray-300 rounded-md text-sm" />
                                    </div>
                                    <button onClick={resetSkeleton} className="w-full flex items-center justify-center gap-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 rounded-md"><RedoIcon className="w-4 h-4 transform scale-x-[-1]" />{t('resetSkeleton')}</button>
                                </>
                            )}
                             {activeTab === 'upload' && (
                                <>
                                 <input type="file" ref={uploadRef} onChange={handleUpload} accept="image/*" className="hidden" />
                                 <button onClick={() => uploadRef.current?.click()} className="w-full flex items-center justify-center gap-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 rounded-md"><UploadIcon className="w-5 h-5" />{t('uploadPose')}</button>
                                </>
                            )}
                             {activeTab === 'draw' && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <label htmlFor="draw-color" className="text-sm font-medium text-gray-700">{t('brushColor')}</label>
                                        <input id="draw-color" type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-white" />
                                    </div>
                                    <div className="flex flex-col">
                                        <label htmlFor="draw-size" className="text-sm font-medium text-gray-700 mb-1">{t('brushSize')}</label>
                                        <div className="flex items-center gap-2">
                                            <input id="draw-size" type="range" min="1" max="50" value={drawSize} onChange={(e) => setDrawSize(Number(e.target.value))} className="w-full" />
                                            <span className="text-sm w-6 text-center font-semibold text-gray-600">{drawSize}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => setDrawingPoints([])} className="w-full flex items-center justify-center gap-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 rounded-md"><TrashIcon className="w-5 h-5" />{t('clearDrawing')}</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                    <button onClick={onClose} className="bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-5 rounded-lg hover:bg-gray-100 transition-colors text-sm">{t('cancel')}</button>
                    <button onClick={handleSave} className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-colors text-sm">{t('savePose')}</button>
                </div>
            </div>
        </div>
    )
}