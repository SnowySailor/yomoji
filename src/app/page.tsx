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
}


export default function VideoCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
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

  const selectScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia();
      setStream(stream);
      setIsCaptureLoopEnabled(true);
    } catch (error) {
      console.error('Error accessing screen: ', error);
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { offsetX, offsetY } = getAdjustedCoordinates(e);
    setStartPos({ x: offsetX, y: offsetY });
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) { return; }

    const { offsetX, offsetY } = getAdjustedCoordinates(e);
    setEndPos({ x: offsetX, y: offsetY });

    const context = canvasRef.current?.getContext('2d');
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      context.strokeStyle = 'red';
      context.lineWidth = 2;
      context.strokeRect(startPos.x, startPos.y, offsetX - startPos.x, offsetY - startPos.y);
    }
  };

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

  const getAdjustedCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !videoRef.current) {
      return {
        offsetX: e.nativeEvent.offsetX,
        offsetY: e.nativeEvent.offsetY
      };
    }

    let hackMultiple = 1;
    if (window.devicePixelRatio >= 2) {
      hackMultiple = window.devicePixelRatio;
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    const realCanvasWidth = canvasRect.width * hackMultiple;
    const realCanvasHeight = canvasRect.height * hackMultiple;

    const scaleX = videoWidth / realCanvasWidth;
    const scaleY = videoHeight / realCanvasHeight;

    return {
      offsetX: e.nativeEvent.offsetX * scaleX,
      offsetY: e.nativeEvent.offsetY * scaleY
    };
  };

  const getSelectedImageData = useCallback(async (): Promise<CanvasCapture | undefined> => {
    if (!canvasRef.current || !videoRef.current) { return; }

    const captureCanvas = document.createElement('canvas');
    const captureContext = captureCanvas.getContext('2d');
    if (!captureContext) { return; }

    let hackMultiple = 1;
    if (window.devicePixelRatio >= 2) {
      hackMultiple = window.devicePixelRatio;
    }

    const width = endPos.x - startPos.x;
    const height = endPos.y - startPos.y;
    captureCanvas.width = width * hackMultiple;
    captureCanvas.height = height * hackMultiple;

    captureContext.drawImage(
      videoRef.current,
      startPos.x * hackMultiple,
      startPos.y * hackMultiple,
      width * hackMultiple,
      height * hackMultiple,
      0,
      0,
      width * hackMultiple,
      height * hackMultiple
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
  }, [endPos.x, endPos.y, startPos.x, startPos.y, preprocessorSettings.binarize,
    preprocessorSettings.blurRadius, preprocessorSettings.dilate, preprocessorSettings.invert,
    preprocessorSettings.isBinarize, videoRef?.current?.srcObject
  ]);

  const captureSelection = useCallback(async () => {
    const imageData = await getSelectedImageData();
    if (!imageData) { return; }
    const { capture  } = imageData;

    if (images.length > 0) {
      console.log('Comparing new and most recent images...', new Date().toISOString());
      if (await compareImages([capture, images[0]])) {
        console.log('No change in image detected', new Date().toISOString());
      } else {
        console.log('Detected change in image, reprocessing...', new Date().toISOString());
        setIsSeekingStaticImageMode(true);
      }
    }

    console.log('Saving most recent image...', new Date().toISOString());
    setImages((current) => {
      if (current && current.length >= 3) {
        current.pop();
      }
      return [capture, ...(current || [])];
    });
  }, [
    images, endPos, startPos, videoRef, preprocessorSettings.binarize,
    preprocessorSettings.blurRadius, preprocessorSettings.dilate, preprocessorSettings.invert,
    preprocessorSettings.isBinarize
  ]);

  const processImage = useCallback(async () => {
    if (images.length === 0) {
      return;
    }

    try {
      const result = await doOcr({ image: images[0].imageBase64 });
      if (result) {
        console.log('OCR result:', result);
        const text = result.fullTextAnnotation?.text || '';
        if (textAreaRef.current) {
          textAreaRef.current.value = text;
        }
      }
    } catch (error) {
      console.error('Error processing image:', error);
    }
  }, [images]);

  const endDrawing = useCallback(async () => {
    setIsDrawing(false);
    await captureSelection();
  }, [captureSelection]);

  useEffect(() => {
    async function handle() { 
      const imageData = await getSelectedImageData();
      if (!imageData) { return; }
      const { capture: { width, height }, canvas } = imageData;

      if (previewRef.current) {
        previewRef.current.width = width;
        previewRef.current.height = height;
        previewRef.current.getContext('2d')?.putImageData(preprocessImage(canvas, preprocessorSettings), 0, 0);
      }
    }
    handle().catch(console.error);
  }, [endPos, startPos, videoRef, preprocessorSettings.binarize,
    preprocessorSettings.blurRadius, preprocessorSettings.dilate, preprocessorSettings.invert,
    preprocessorSettings.isBinarize
  ]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        if (canvasRef.current && videoRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
        }
      };
    }
  }, [stream]);

  useEffect(() => {
    const handle = async () => {
      if (isSeekingStaticImageMode) {
        console.log('Comparing in seeking static image mode...', new Date().toISOString());
        if (await compareImages(images)) {
          setIsSeekingStaticImageMode(false);
          await processImage();
        }
      }
    }
    handle().catch(console.error);
  }, [images, isSeekingStaticImageMode, processImage]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isCaptureLoopEnabled) {
      intervalId = setInterval(async () => {
        await captureSelection();
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isCaptureLoopEnabled, captureSelection]);

  return <>
    <div>
      <button onClick={selectScreen}>Select screen</button>
      <button onClick={() => setIsCaptureLoopEnabled(!isCaptureLoopEnabled)}>{isCaptureLoopEnabled ? 'Stop' : 'Start'} capture loop</button>
    </div>
    <div>
      <div className="relative w-full h-auto">
        <video ref={videoRef} autoPlay className="w-full h-auto" />
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          className="absolute top-0 left-0 w-full h-full cursor-crosshair"
        />
      </div>
      <br/>
      <textarea ref={textAreaRef} className="w-full h-64 text-3xl mt-4 p-2 text-white bg-gray-900 border-0 shadow-none resize-none outline-none" />
    </div>
    <ImagePreprocessor preprocessorSettings={preprocessorSettings} setPreprocessorSettings={setPreprocessorSettings} previewRef={previewRef} />
  </>
};
