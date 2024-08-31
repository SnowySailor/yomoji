'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { doOcr, compareImages } from './functions';
import { preprocessImage } from '@/lib/image';

export interface PreprocessorSettings {
  isBinarize: boolean;
  binarize: number;
  blurRadius: number;
  invert: boolean;
  dilate: boolean;
};

export type CanvasCaptureImage = {
  imageBase64: string;
  width: number;
  height: number;
};

export type CanvasCapture = {
  canvas: HTMLCanvasElement;
  capture: CanvasCaptureImage;
};

function DummyYomichanSentenceTerminator() {
  // This element is a hack to keep Yomitan at bay.
  // It adds one of the sentence termination characters to the DOM
  // but keeps it invisible so that it doesn't end up including the stuff
  // before the beginning or after the end of the page containers.
  // Chromium is smart enough to know that 'color:transparent' means that the content is not
  // visible (so it's ignored), so we have to use a color that is almost transparent instead
  return (
    // eslint-disable-next-line react/no-unescaped-entities
    <p className="dummyYomichanSentenceTerminator" style={{ position: 'absolute', color: 'rgba(255,255,255,0.01)', zIndex: '-1' }}>"</p>
  );
}

function ImagePreprocessor({
  preprocessorSettings,
  setPreprocessorSettings,
  previewRef
}: {
  setPreprocessorSettings: (settings: PreprocessorSettings) => void,
  preprocessorSettings: PreprocessorSettings,
  previewRef: React.RefObject<HTMLCanvasElement>
}) {
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <label className="flex items-center space-x-2">
        <span>Is Binarize</span>
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-blue-600"
          checked={preprocessorSettings.isBinarize}
          onChange={(e) => {
            setPreprocessorSettings({
              ...preprocessorSettings,
              isBinarize: e.target.checked,
            });
          }}
        />
      </label>
      <label className="flex items-center space-x-2">
        <span>Binarize</span>
        <input
          type="range"
          min={0}
          max={100}
          className="form-range w-full"
          value={preprocessorSettings.binarize}
          onChange={(e) => {
            setPreprocessorSettings({
              ...preprocessorSettings,
              binarize: e.target.valueAsNumber,
            });
          }}
        />
      </label>
      <label className="flex items-center space-x-2">
        <span>Blur radius</span>
        <input
          type="range"
          min={0}
          max={100}
          className="form-range w-full"
          value={preprocessorSettings.blurRadius}
          onChange={(e) => {
            setPreprocessorSettings({
              ...preprocessorSettings,
              blurRadius: e.target.valueAsNumber,
            });
          }}
        />
      </label>
      <label className="flex items-center space-x-2">
        <span>Dilate</span>
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-blue-600"
          checked={preprocessorSettings.dilate}
          onChange={(e) => {
            setPreprocessorSettings({
              ...preprocessorSettings,
              dilate: e.target.checked,
            });
          }}
        />
      </label>
      <label className="flex items-center space-x-2">
        <span>Invert</span>
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-blue-600"
          checked={preprocessorSettings.invert}
          onChange={(e) => {
            setPreprocessorSettings({
              ...preprocessorSettings,
              invert: e.target.checked,
            });
          }}
        />
      </label>
    </div>

    <div className="flex justify-center">
      <canvas
        ref={previewRef}
        className="border border-gray-300"
      />
    </div>
  </div>
};

function ScreenCaptureButtons({
  isCaptureLoopEnabled,
  setIsCaptureLoopEnabled,
  selectScreen,
  processImage,
}: {
  isCaptureLoopEnabled: boolean,
  setIsCaptureLoopEnabled: (enabled: boolean) => void,
  selectScreen: () => void,
  processImage: () => void
}) {
  return <div className="flex space-x-4">
    <button
      onClick={() => { processImage() }}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      Force process image
    </button>
    <button
      onClick={selectScreen}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      Select screen
    </button>
    <button
      onClick={() => setIsCaptureLoopEnabled(!isCaptureLoopEnabled)}
      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
    >
      {isCaptureLoopEnabled ? 'Stop' : 'Start'} capture loop
    </button>
  </div>
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    }
    reader.readAsDataURL(blob);
  });
}

function getScaledCoordinated(e: React.MouseEvent<HTMLCanvasElement>): { offsetX: number, offsetY: number } {
  const { offsetX, offsetY } = e.nativeEvent;
  return {
    offsetX: offsetX / window.devicePixelRatio,
    offsetY: offsetY / window.devicePixelRatio,
  };
}

export default function VideoCapture() {
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const ocrResultRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [images, setImages] = useState<CanvasCaptureImage[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCaptureLoopEnabled, setIsCaptureLoopEnabled] = useState<boolean>(false);
  const [isSeekingStaticImageMode, setIsSeekingStaticImageMode] = useState<boolean>(false);
  const [preprocessorSettings, setPreprocessorSettings] = useState<PreprocessorSettings>({
    isBinarize: false,
    binarize: 50,
    blurRadius: 0,
    invert: false,
    dilate: false,
  });

  const getSelectedImageData = useCallback(async (): Promise<CanvasCapture | undefined> => {
    if (!canvasRef.current || !videoRef.current) { return; }

    const captureCanvas = document.createElement('canvas');
    const captureContext = captureCanvas.getContext('2d');
    if (!captureContext) { return; }

    const canvasVideoScaleFactor = canvasRef.current.width / videoRef.current.videoWidth;
    const width = Math.floor(((endPos.x - startPos.x) / canvasVideoScaleFactor) * window.devicePixelRatio);
    const height = Math.floor(((endPos.y - startPos.y) / canvasVideoScaleFactor) * window.devicePixelRatio);
    captureCanvas.width = width;
    captureCanvas.height = height;

    const startPosScaled = {
      x: Math.floor((startPos.x / canvasVideoScaleFactor) * window.devicePixelRatio),
      y: Math.floor((startPos.y / canvasVideoScaleFactor) * window.devicePixelRatio),
    };

    captureContext.drawImage(
      videoRef.current,
      startPosScaled.x,
      startPosScaled.y,
      width,
      height,
      0,
      0,
      width,
      height
    );

    if (captureCanvas.width === 0 || captureCanvas.height === 0) {
      console.log('No image data captured');
      return;
    }

    captureContext.putImageData(preprocessImage(captureCanvas, preprocessorSettings), 0, 0);
    const imageBlob: Blob | null = await new Promise(resolve => captureCanvas.toBlob(resolve, 'image/png'));
    if (!imageBlob) {
      return;
    }

    return {
      capture: {
        imageBase64: await blobToBase64(imageBlob),
        width: captureCanvas.width,
        height: captureCanvas.height,
      },
      canvas: captureCanvas,
    } as CanvasCapture;
  }, [startPos, endPos, preprocessorSettings, videoRef, canvasRef]);

  const putPreviewImage = useCallback(async () => {
    const imageData = await getSelectedImageData();
    if (!imageData) { return; }
    const { capture: { width, height }, canvas } = imageData;

    if (previewRef.current) {
      previewRef.current.width = width;
      previewRef.current.height = height;
      previewRef.current.getContext('2d')?.putImageData(preprocessImage(canvas, preprocessorSettings), 0, 0);
    }
  }, [getSelectedImageData, preprocessorSettings, previewRef]);

  const resizeCanvas = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) { return false; }
    const { width, height } = canvas.getBoundingClientRect();
    const { videoWidth, videoHeight } = video;
  
    if (
      canvas.width !== width
      || canvas.height !== height
      || canvas.width !== videoWidth
      || canvas.height !== videoHeight
    ) {
      const videoAspectRatio = videoWidth / videoHeight;
      const canvasHeight = width / videoAspectRatio;
    
      const { devicePixelRatio: ratio = 1 } = window;
      const context = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = canvasHeight;
  
      context?.scale(ratio, ratio);
      return true;
    }
    return false;
  }, [canvasRef, videoRef]);

  const selectScreen = useCallback(async () => {
    if (!videoRef.current) { return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia();
      videoRef.current.srcObject = stream;
      setIsCaptureLoopEnabled(true);
      resizeCanvas();
    } catch (error) {
      console.error('Error accessing screen: ', error);
    }
  }, [videoRef, resizeCanvas]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { offsetX , offsetY } = getScaledCoordinated(e);
    setStartPos({ x: offsetX, y: offsetY });
    setIsDrawing(true);
  };

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) { return; }

    const { offsetX , offsetY } = getScaledCoordinated(e);
    setEndPos({ x: offsetX, y: offsetY });

    const context = canvasRef.current?.getContext('2d');
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      context.strokeStyle = 'red';
      context.lineWidth = 2;
      context.strokeRect(startPos.x, startPos.y, offsetX - startPos.x, offsetY - startPos.y);
    }
  }, [isDrawing, startPos, canvasRef]);

  const endDrawing = useCallback(async () => {
    setIsDrawing(false);
    putPreviewImage().then(console.error);
  }, [putPreviewImage]);

  const processImage = useCallback(async () => {
  }, []);

  // const captureSelection = useCallback(async () => {
  //   const imageData = await getSelectedImageData();
  //   if (!imageData) { return; }
  //   const { capture  } = imageData;

  //   if (images.length > 0) {
  //     const { equal, percentageDifferences } = await compareImages([capture, images[0]]);
  //     // console.log('Image comparison result:', equal, percentageDifferences);
  //     if (equal) {
  //       // console.log('No change in image detected', new Date().toISOString());
  //     } else {
  //       // console.log('Detected change in image, reprocessing...', new Date().toISOString());
  //       setIsSeekingStaticImageMode(true);
  //     }
  //   }

  //   // console.log('Saving most recent image...', new Date().toISOString());
  //   setImages((current) => {
  //     while (current && current.length > 2) {
  //       current.pop();
  //     }
  //     return [capture, ...(current || [])];
  //   });
  //   return capture;
  // }, [
  //   images, getSelectedImageData
  // ]);

  // const processImage = useCallback(async (capture?: CanvasCaptureImage) => {
  //   if (images.length === 0 && !capture) {
  //     return;
  //   }

  //   try {
  //     const imageToProcess = capture || images[0];
  //     const result = await doOcr({ image: imageToProcess.imageBase64 });
  //     // console.log('OCR result:', result);
  //     if (result) {
  //       const text = result.fullTextAnnotation?.text || '';
  //       if (ocrResultRef.current) {
  //         ocrResultRef.current.innerText = text;
  //       }
  //     }
  //   } catch (error) {
  //     console.error('Error processing image:', error);
  //   }
  // }, [images]);

  // useEffect(() => {
  //   const handle = async () => {
  //     if (isSeekingStaticImageMode) {
  //       const { equal, percentageDifferences } = await compareImages(images);
  //       // console.log('Image comparison result:', equal, percentageDifferences);
  //       if (equal) {
  //         setIsSeekingStaticImageMode(false);
  //         await processImage();
  //       }
  //     }
  //   }
  //   handle().catch(console.error);
  // }, [images, isSeekingStaticImageMode, processImage]);

  // useEffect(() => {
  //   let intervalId: NodeJS.Timeout | null = null;

  //   if (isCaptureLoopEnabled) {
  //     intervalId = setInterval(async () => {
  //       await captureSelection();
  //     }, 1000);
  //   }

  //   return () => {
  //     if (intervalId) {
  //       clearInterval(intervalId);
  //     }
  //   };
  // }, [isCaptureLoopEnabled, captureSelection]);

  return <>
    <div>
      <div className="relative w-full h-auto">
        <video ref={videoRef} autoPlay className="w-full h-auto" onResize={resizeCanvas}/>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          className="absolute top-0 left-0 w-full h-full cursor-crosshair"
        />
      </div>
      <br/>
      <ScreenCaptureButtons
        isCaptureLoopEnabled={isCaptureLoopEnabled}
        setIsCaptureLoopEnabled={setIsCaptureLoopEnabled}
        selectScreen={selectScreen}
        processImage={processImage}
      />
      <DummyYomichanSentenceTerminator />
      <div
        ref={ocrResultRef}
        contentEditable={true}
        suppressContentEditableWarning={true}
        className="w-full h-64 text-3xl mt-4 p-2 text-white bg-gray-900 border-0 shadow-none resize-none outline-none overflow-scroll"
      />
      {/* <textarea ref={textAreaRef} className="w-full h-64 text-3xl mt-4 p-2 text-white bg-gray-900 border-0 shadow-none resize-none outline-none" /> */}
      <DummyYomichanSentenceTerminator />
    </div>
    <ImagePreprocessor preprocessorSettings={preprocessorSettings} setPreprocessorSettings={setPreprocessorSettings} previewRef={previewRef} />
  </>
};
