'use client';

import React, { useRef, useState, useEffect } from 'react';
import { doOcr } from './functions';

export default function VideoCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
  const [imageData, setImageData] = useState<Blob | null>(null);
  const [selectedScreen, setSelectedScreen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const selectScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia();
      setStream(stream);
      setSelectedScreen(true);
    } catch (error) {
      console.error('Error accessing screen: ', error);
    }
  }

  useEffect(() => {
    if (!selectedScreen) {
      return;
    }

    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        if (canvasRef.current && videoRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
        }
      };
    }
  }, [selectedScreen]);

  useEffect(() => {
    processImage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { offsetX, offsetY } = getAdjustedCoordinates(e);
    setStartPos({ x: offsetX, y: offsetY });
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

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

  const endDrawing = async () => {
    setIsDrawing(false);
    await captureSelection();
  };

  const captureSelection = async () => {
    if (!canvasRef.current || !videoRef.current) return;

    const captureCanvas = document.createElement('canvas');
    const captureContext = captureCanvas.getContext('2d');
    if (!captureContext) return;

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

    if (debugCanvasRef.current) {
      debugCanvasRef.current.width = width;
      debugCanvasRef.current.height = height;
      const debugContext = debugCanvasRef.current.getContext('2d');
      if (debugContext) {
        debugContext.drawImage(captureCanvas, 0, 0);
      }
    }

    const blob = await new Promise(resolve => captureCanvas.toBlob(resolve, 'image/png'));
    setImageData(blob as Blob);
  };

  const processImage = async () => {
    if (!imageData) {
      console.log('No image data to process');
      return;
    }

    try {
      const base64Image = await blobToBase64(imageData);
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
    if (!canvasRef.current || !videoRef.current) return { offsetX: e.nativeEvent.offsetX, offsetY: e.nativeEvent.offsetY };

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    
    const scaleX = videoWidth / canvasRect.width;
    const scaleY = videoHeight / canvasRect.height;

    return {
      offsetX: e.nativeEvent.offsetX * scaleX,
      offsetY: e.nativeEvent.offsetY * scaleY
    };
  };

  return <>
    { !selectedScreen ? (
      <>
        <button onClick={selectScreen}>Select screen</button>
        <video ref={videoRef} autoPlay className="w-full h-auto opacity-0" />
      </>
    ) : (
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
      <textarea ref={textAreaRef} className="w-full h-32 mt-4 p-2 text-white bg-gray-900 border-0 shadow-none resize-none outline-none" />
      <canvas ref={debugCanvasRef} className="w-full h-auto" />
    </div>
    )}
  </>
};
