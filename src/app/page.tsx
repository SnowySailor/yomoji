'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { doOcr, compareImages } from './functions';

export default function VideoCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCaptureLoopEnabled, setIsCaptureLoopEnabled] = useState<boolean>(false);

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

  const captureSelection = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) { return; }

    const captureCanvas = document.createElement('canvas');
    const captureContext = captureCanvas.getContext('2d');
    if (!captureContext) { return; }

    const width = endPos.x - startPos.x;
    const height = endPos.y - startPos.y;
    captureCanvas.width = width;
    captureCanvas.height = height;

    captureContext.drawImage(
      videoRef.current,
      startPos.x,
      startPos.y,
      width,
      height,
      0,
      0,
      width,
      height
    );

    const newImageData = await new Promise(resolve => captureCanvas.toBlob(resolve, 'image/png'));
    if (!newImageData) {
      console.error('Failed to capture image data');
      return;
    }

    const newImageBase64 = await blobToBase64(newImageData as Blob);
    if (base64Image) {
      if (await compareImages(newImageBase64, base64Image)) {
        console.log('No change in image detected');
        return;
      } else {
        console.log('Detected change in image, reprocessing...');
      }
    }
    setBase64Image(newImageBase64);
  }, [base64Image, endPos, startPos, videoRef]);

  const endDrawing = useCallback(async () => {
    setIsDrawing(false);
    await captureSelection();
  }, [captureSelection]);

  const processImage = useCallback(async () => {
    if (!base64Image) {
      return;
    }

    try {
      const result = await doOcr({ image: base64Image });
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
  }, [base64Image]);

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
    processImage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base64Image]);

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
    { stream === null ? (
      <>
        <button onClick={selectScreen}>Select screen</button>
        <video ref={videoRef} autoPlay className="w-full h-auto opacity-0" />
      </>
    ) : (
      <>
        <button onClick={() => setIsCaptureLoopEnabled(!isCaptureLoopEnabled)}>{isCaptureLoopEnabled ? 'Stop' : 'Start'} capture loop</button>
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
      </>
    )}
  </>
};
