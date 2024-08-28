'use server';

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Buffer } from 'buffer';
import { writeFileSync } from 'fs';
import pixelmatch from 'pixelmatch';
import type { CanvasCaptureImage } from './page';
import { PNG } from 'pngjs';

const client = new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

interface OcrData {
  image: string;
}

export const doOcr = async (data: OcrData) => {
  try {
    console.log('Spending money on OCR...');
    const buffer = Buffer.from(data.image, 'base64');
    const fileBuffer = Buffer.from(data.image, 'base64');
    writeFileSync(`/app/debug/${Date.now()}.png`, fileBuffer);

    const [result] = await client.annotateImage({
      image: { content: buffer },
      features: [{ type: 'TEXT_DETECTION' }],
      imageContext: { languageHints: ['ja'] },
    });
    return result;
  } catch (error) {
    console.error('Error during OCR:', error);
    return false;
  }
}

export const compareImages = async (images: CanvasCaptureImage[]) => {
  const percentageThreshold = 0.05;
  const equalityChecks = await Promise.all(images.map(async (image, index) => {
    if (index === 0) { return true };
    const { imageBase64 } = image;
    const { imageBase64: imageBase64Prev } = images[index - 1];
    const image1 = PNG.sync.read(Buffer.from(imageBase64, 'base64'));
    const image2 = PNG.sync.read(Buffer.from(imageBase64Prev, 'base64'));
    const { width, height } = image1;
    const { width: width2, height: height2 } = image2;
    if (width !== width2 || height !== height2) {
      return false;
    }
    const diff = new PNG({width, height});

    const diffPixels = pixelmatch(image1.data, image2.data, diff.data, width, height, { threshold: 0.1 });
    writeFileSync(`/app/debug/diff-${Date.now()}-${diffPixels}.png`, PNG.sync.write(diff));
    return diffPixels / (width * height) < percentageThreshold;
  }));

  return equalityChecks.every(equal => equal);
}
