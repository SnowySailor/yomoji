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

export const compareImages = async (images: string[]) => {
  const equalityChecks = await Promise.all(images.map(async (image, index) => {
    if (index === 0) { return true };
    const image1Buffer = Buffer.from(images[index - 1], 'base64');
    const image2Buffer = Buffer.from(image, 'base64');
    const { equal } = await looksSame(image1Buffer, image2Buffer, { tolerance: 2.3 });
    return equal;
  }));

  return equalityChecks.every(equal => equal);
}
