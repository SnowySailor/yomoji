'use server';

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Buffer } from 'buffer';
import { writeFileSync } from 'fs';
import looksSame from 'looks-same';

const client = new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

interface OcrData {
  image: string;
}

export const doOcr = async (data: OcrData) => {
  try {
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

export const compareImages = async (image1: string, image2: string) => {
  const image1Buffer = Buffer.from(image1, 'base64');
  const image2Buffer = Buffer.from(image2, 'base64');
  const result = await looksSame(image1Buffer, image2Buffer, { tolerance: 2.3 });
  return result.equal;
}
