'use client';

import React, { useRef, useState, useEffect } from 'react';
import { preprocessImage } from '@/lib/image';
import { useInterval } from 'usehooks-ts';
import clsx from 'clsx';
import { doOcr, compareImages } from './functions';

export type PreprocessorSettings = {
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
  previewRef,
}: {
  preprocessorSettings: PreprocessorSettings
  setPreprocessorSettings: (settings: PreprocessorSettings) => void,
  previewRef: React.RefObject<HTMLCanvasElement>
}) {
  return (
    <div className="flex space-x-4">
      <div className="w-1/3">
        <div className="grid grid-cols-2 gap-4 items-center w-full">
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

          <span>Binarize</span>
          <input
            type="range"
            min={0}
            max={100}
            className="form-range"
            value={preprocessorSettings.binarize}
            onChange={(e) => {
              setPreprocessorSettings({
                ...preprocessorSettings,
                binarize: e.target.valueAsNumber,
              });
            }}
          />

          <span>Blur radius</span>
          <input
            type="range"
            min={0}
            max={100}
            className="form-range"
            value={preprocessorSettings.blurRadius}
            onChange={(e) => {
              setPreprocessorSettings({
                ...preprocessorSettings,
                blurRadius: e.target.valueAsNumber,
              });
            }}
          />

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
        </div>
      </div>
      <div className="flex justify-center w-2/3">
        <canvas
          ref={previewRef}
          className="border border-gray-300 max-w-full"
        />
      </div>
    </div>
  );
}

function ScreenCaptureButtons({
  isCaptureLoopEnabled,
  setIsCaptureLoopEnabled,
  imageDiffThreshold,
  setImageDiffThreshold,
  selectScreen,
  processImage,
}: {
  isCaptureLoopEnabled: boolean,
  setIsCaptureLoopEnabled: (v: boolean) => void,
  imageDiffThreshold: number,
  setImageDiffThreshold: (v: number) => void,
  selectScreen: () => void,
  processImage: () => void
}) {
  return (
    <div className="flex space-x-4">
      <button
        type="button"
        onClick={() => { processImage(); }}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Force process image
      </button>
      <button
        type="button"
        onClick={selectScreen}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Select screen
      </button>
      <button
        type="button"
        onClick={() => { setIsCaptureLoopEnabled(!isCaptureLoopEnabled); }}
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
      >
        {isCaptureLoopEnabled ? 'Stop' : 'Start'} capture loop
      </button>
      <span className="pl-4 py-2">Image change sensitivity</span>
      <input
        type="number"
        step={0.001}
        min={0}
        max={1}
        value={imageDiffThreshold}
        className="w-20 text-black text-center rounded"
        onChange={(e) => setImageDiffThreshold(e.target.valueAsNumber)}
      />
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function getScaledCoordinated(
  e: React.MouseEvent<HTMLCanvasElement>,
): { offsetX: number, offsetY: number } {
  const { offsetX, offsetY } = e.nativeEvent;
  return {
    offsetX: offsetX / window.devicePixelRatio,
    offsetY: offsetY / window.devicePixelRatio,
  };
}

export default function VideoCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const ocrResultRef = useRef<HTMLDivElement>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
  const [isCaptureLoopEnabled, setIsCaptureLoopEnabled] = useState(false);
  const [images, setImages] = useState<CanvasCaptureImage[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSeekingStaticImageMode, setIsSeekingStaticImageMode] = useState(false);
  const [preprocessorSettings, setPreprocessorSettings] = useState<PreprocessorSettings>({
    isBinarize: false,
    binarize: 50,
    blurRadius: 0,
    invert: false,
    dilate: false,
  });
  const [previewImageData, setPreviewImageData] = useState<CanvasCapture | null>(null);
  const [imageDiffThreshold, setImageDiffThreshold] = useState(0.02);

  const triggerOcrResultsFlash = () => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 500);
  };

  const getSelectedImageData = async (): Promise<CanvasCapture | null> => {
    if (!canvasRef.current || !videoRef.current) { return null; }

    const captureCanvas = document.createElement('canvas');
    const captureContext = captureCanvas.getContext('2d', { willReadFrequently: true });
    if (!captureContext) { return null; }

    const canvasVideoScaleFactor = canvasRef.current.width / videoRef.current.videoWidth;
    const width = Math.floor(
      ((endPos.x - startPos.x) / canvasVideoScaleFactor) * window.devicePixelRatio,
    );
    const height = Math.floor(
      ((endPos.y - startPos.y) / canvasVideoScaleFactor) * window.devicePixelRatio,
    );
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
      height,
    );

    if (captureCanvas.width === 0 || captureCanvas.height === 0) {
      console.log('No image data captured');
      return null;
    }

    captureContext.putImageData(preprocessImage(captureCanvas, preprocessorSettings), 0, 0);
    const imageBlob: Blob | null = await new Promise((resolve) => { captureCanvas.toBlob(resolve, 'image/png'); });
    if (!imageBlob) {
      return null;
    }

    return {
      capture: {
        imageBase64: await blobToBase64(imageBlob),
        width: captureCanvas.width,
        height: captureCanvas.height,
      },
      canvas: captureCanvas,
    } as CanvasCapture;
  };

  const savePreviewImage = async () => {
    const imageData = await getSelectedImageData();
    if (!imageData) { return; }
    setPreviewImageData(imageData);
  };

  const resizeCanvas = (): void => {
    if (!canvasRef.current || !videoRef.current) { return; }
    const { width } = canvasRef.current.getBoundingClientRect();
    const { videoWidth, videoHeight } = videoRef.current;

    const videoAspectRatio = videoWidth / videoHeight;
    const canvasHeight = width / videoAspectRatio;

    const { devicePixelRatio: ratio = 1 } = window;
    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = width;
    canvasRef.current.height = canvasHeight;

    context?.scale(ratio, ratio);
  };

  const selectScreen = async () => {
    if (!videoRef.current) { return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia();
      videoRef.current.srcObject = stream;
      setIsCaptureLoopEnabled(true);
      resizeCanvas();
    } catch (error) {
      console.error('Error accessing screen: ', error);
    }
  };

  const processImage = async (capture: CanvasCaptureImage) => {
    try {
      const result = await doOcr({ image: capture.imageBase64 });
      triggerOcrResultsFlash();
      console.log('OCR result', result);
      if (result) {
        const text = result.fullTextAnnotation?.text || '';
        if (ocrResultRef.current) {
          ocrResultRef.current.innerText = text;
        }
      }
    } catch (error) {
      console.error('Error processing image:', error);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { offsetX, offsetY } = getScaledCoordinated(e);
    setStartPos({ x: offsetX, y: offsetY });
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) { return; }

    const { offsetX, offsetY } = getScaledCoordinated(e);
    setEndPos({ x: offsetX, y: offsetY });

    const context = canvasRef.current?.getContext('2d', { willReadFrequently: true });
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      context.strokeStyle = 'red';
      context.lineWidth = 2;
      context.strokeRect(startPos.x, startPos.y, offsetX - startPos.x, offsetY - startPos.y);
    }
  };

  const endDrawing = async () => {
    setIsDrawing(false);
    savePreviewImage().catch(console.error);
    const imageData = await getSelectedImageData();
    if (!imageData) { return; }
    await processImage(imageData.capture);
  };

  useEffect(() => {
    if (!previewImageData) { return; }
    const { capture: { width, height }, canvas } = previewImageData;
    if (previewRef.current) {
      previewRef.current.width = width;
      previewRef.current.height = height;
      previewRef.current.getContext('2d')?.drawImage(canvas, 0, 0);
    }
  }, [previewRef, previewImageData]);

  useInterval(async () => {
    if (!isCaptureLoopEnabled) { return; }
    const imageData = await getSelectedImageData();
    if (!imageData) { return; }
    const { capture } = imageData;

    const newImages = [capture, ...images.slice(0, 2)];
    if (isSeekingStaticImageMode) {
      console.log('Seeking static image mode...');
      const { equal, percentageDifferences } = await compareImages(newImages, imageDiffThreshold);
      console.log('Image comparison result:', equal, percentageDifferences);
      if (equal) {
        console.log('Static image detected...');
        setIsSeekingStaticImageMode(false);
        await processImage(capture);
      }
    } else {
      if (images.length === 0) {
        setImages([capture]);
        return;
      }

      const { equal, percentageDifferences } = await compareImages(
        [capture, images[0]],
        imageDiffThreshold,
      );
      console.log('Image comparison result:', equal, percentageDifferences);
      if (equal) { return; }
      console.log('Detected change in image...');
      setIsSeekingStaticImageMode(true);
    }
    setImages(newImages);
  }, 1000);

  useEffect(() => {
    getSelectedImageData().then((imageData) => setPreviewImageData(imageData)).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preprocessorSettings]);

  return (
    <>
      <div>
        <div className="relative w-full h-auto">
          <video ref={videoRef} autoPlay className="w-full h-auto" onResize={resizeCanvas} />
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            className="absolute top-0 left-0 w-full h-full cursor-crosshair"
          />
        </div>
        <br />
        <ScreenCaptureButtons
          isCaptureLoopEnabled={isCaptureLoopEnabled}
          setIsCaptureLoopEnabled={setIsCaptureLoopEnabled}
          imageDiffThreshold={imageDiffThreshold}
          setImageDiffThreshold={setImageDiffThreshold}
          selectScreen={selectScreen}
          processImage={async () => {
            const imageData = await getSelectedImageData();
            if (!imageData) { return; }
            await processImage(imageData.capture);
          }}
        />
        <DummyYomichanSentenceTerminator />
        <div
          ref={ocrResultRef}
          contentEditable
          suppressContentEditableWarning
          className={clsx(
            isFlashing ? 'flash-border' : '',
            'border-solid border-transparent border-[3px]',
            'w-full h-64 text-3xl mt-4 p-2 text-white bg-gray-900 shadow-none resize-none outline-none overflow-scroll',
          )}
        />
        <DummyYomichanSentenceTerminator />
      </div>
      <ImagePreprocessor
        preprocessorSettings={preprocessorSettings}
        setPreprocessorSettings={setPreprocessorSettings}
        previewRef={previewRef}
      />
    </>
  );
}
