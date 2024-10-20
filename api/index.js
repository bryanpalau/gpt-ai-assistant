import express from 'express';
import { handleEvents, printPrompts } from '../app/index.js';
import config from '../config/index.js';
import { validateLineSignature } from '../middleware/index.js';
import storage from '../storage/index.js';
import { fetchVersion, getVersion } from '../utils/index.js';
import openai from 'openai';  // Step 1: Import the OpenAI SDK

const app = express();

// Set OpenAI API key from environment variables
openai.apiKey = process.env.OPENAI_API_KEY;

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  },
}));

// Function to get a response from ChatGPT (OpenAI)
const getChatGPTResponse = async (userMessage) => {
  const response = await openai.Completion.create({
    model: 'gpt-4',  // You can switch this to any available model
    prompt: userMessage,
    max_tokens: 200,  // Adjust as needed
  });

  return response.choices[0].text.trim();
};

// Modified version of handleEvents function to process LINE messages and integrate with ChatGPT
const handleLineEvents = async (events) => {
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      // Step 2: Get response from ChatGPT (OpenAI)
      const chatGPTResponse = await getChatGPTResponse(userMessage);

      // Step 3: Send reply to LINE user
      await replyToLine(replyToken, chatGPTResponse);
    }
  }
};

// Function to reply to LINE
const replyToLine = async (replyToken, message) => {
  const axios = require('axios');
  const lineEndpoint = 'https://api.line.me/v2/bot/message/reply';

  await axios.post(lineEndpoint, {
    replyToken: replyToken,
    messages: [{ type: 'text', text: message }]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    }
  });
};

app.get('/', async (req, res) => {
  if (config.APP_URL) {
    res.redirect(config.APP_URL);
    return;
  }
  const currentVersion = getVersion();
  const latestVersion = await fetchVersion();
  res.status(200).send({ status: 'OK', currentVersion, latestVersion });
});

// Main webhook endpoint for LINE messages
app.post(config.APP_WEBHOOK_PATH, validateLineSignature, async (req, res) => {
  try {
    await storage.initialize();
    
    // Step 4: Call handleLineEvents instead of original handleEvents
    await handleLineEvents(req.body.events);

    res.sendStatus(200);
  } catch (err) {
    console.error(err.message);
    res.sendStatus(500);
  }
  
  if (config.APP_DEBUG) printPrompts();
});

if (config.APP_PORT) {
  app.listen(config.APP_PORT);
}

export default app;
