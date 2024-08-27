'use server';

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Buffer } from 'buffer';
import { writeFileSync } from 'fs';

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
