# Yomoji
This is a browser OCR app built using NextJS that allows you to use Google Cloud Vision to automatically convert images from your screen into editable/scannable text

You will need Docker and a Google Service Account key with Cloud Vision API access. The API key can be created in the Google Cloud Console and every user gets 1000 free Cloud Vision API requests per month, and after that it's $1.50 per 1000 as of August 2024.

## Running
1. Clone this repository
1. Copy your Google JSON key into `./config/google_servive_account.json`
1. Run `docker compose up`
1. Open `http://localhost:3001` and click the "Select screen" button (you may have to scroll down)
1. Select a screen and you will be able to draw a rectangle around whatever you want to run OCR on

The tool will automatically update if it detects a change in content on the screen, populating the results box below your stream. If you find that it is refreshing too often due to dynamic backgrounds, you can use the filters at the bottom of the page. There is a preview for the filter result underneath the filter settings. Try to adjust it so that only the text is visible; this will minimize the number of false-positive detections and minimize your OCR API usage.
