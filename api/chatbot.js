// api/chatbot.js
    // This file will be deployed as a serverless function on Vercel.

    // You will need to install these packages. They will be listed in package.json
    // and Vercel will install them automatically during deployment.
    const fetch = require('node-fetch');
    const FormData = require('form-data');

    // API Keys will be set as Environment Variables in Vercel.
    // We will set these up in Step 3.
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tzpb8grqXNyUt3m'; // Default voice ID

    // --- OpenAI API Endpoints ---
    const OPENAI_WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
    const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

    // --- ElevenLabs API Endpoint ---
    const ELEVENLABS_TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

    // Vercel Serverless Function entry point
    // It's a simple Node.js function that receives req (request) and res (response) objects.
    module.exports = async (req, res) => {
        // Allow CORS for your frontend (important for web apps)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle preflight requests for CORS (browser sends an OPTIONS request first)
        if (req.method === 'OPTIONS') {
            return res.status(200).send('OK');
        }

        // Ensure it's a POST request for actual data
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        try {
            const { audio: base64Audio } = req.body; // Extract base64 audio from the request body

            if (!base64Audio) {
                console.error('No audio data received.');
                return res.status(400).json({ error: 'No audio data received.' });
            }

            // 1. Convert base64 audio to a Buffer for OpenAI Whisper
            const audioBuffer = Buffer.from(base64Audio, 'base64');

            // Create FormData for OpenAI Whisper API (multipart/form-data)
            const formData = new FormData();
            formData.append('file', audioBuffer, {
                filename: 'audio.webm', // OpenAI expects a filename
                contentType: 'audio/webm',
            });
            formData.append('model', 'whisper-1'); // Using Whisper model for transcription

            // 2. Send audio to OpenAI Whisper for Speech-to-Text
            const whisperResponse = await fetch(OPENAI_WHISPER_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`, // Use your OpenAI API key
                    ...formData.getHeaders(), // Important for multipart/form-data
                },
                body: formData, // Send the audio data
            });

            if (!whisperResponse.ok) {
                const errorData = await whisperResponse.json();
                console.error('OpenAI Whisper API error:', errorData);
                return res.status(whisperResponse.status).json({ error: `Whisper API error: ${JSON.stringify(errorData)}` });
            }

            const whisperData = await whisperResponse.json();
            const transcribedText = whisperData.text; // The text transcribed from your voice

            if (!transcribedText) {
                console.warn('Whisper did not return any text.');
                return res.status(200).json({ text: '', botResponse: 'I could not understand your audio. Please try again.' });
            }

            console.log('Transcribed Text:', transcribedText);

            // 3. Send transcribed text to OpenAI Chat Completion API for a response
            const chatResponse = await fetch(OPENAI_CHAT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`, // Use your OpenAI API key
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo', // Using a common OpenAI chat model
                    messages: [
                        { role: 'system', content: 'You are a helpful and friendly chatbot.' },
                        { role: 'user', content: transcribedText },
                    ],
                    max_tokens: 150, // Limit the response length
                    temperature: 0.7, // Creativity level
                }),
            });

            if (!chatResponse.ok) {
                const errorData = await chatResponse.json();
                console.error('OpenAI Chat API error:', errorData);
                return res.status(chatResponse.status).json({ error: `Chat API error: ${JSON.stringify(errorData)}` });
            }

            const chatData = await chatResponse.json();
            const botResponseText = chatData.choices[0]?.message?.content; // The AI's text response

            if (!botResponseText) {
                console.warn('Chat API did not return any response text.');
                return res.status(200).json({ text: transcribedText, botResponse: 'I could not generate a response. Please try again.' });
            }

            console.log('Bot Response Text:', botResponseText);

            // 4. Send bot response text to ElevenLabs for Text-to-Speech
            const elevenLabsResponse = await fetch(ELEVENLABS_TTS_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg', // Request MP3 audio
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVENLABS_API_KEY, // Use your ElevenLabs API key
                },
                body: JSON.stringify({
                    text: botResponseText,
                    model_id: 'eleven_monolingual_v1', // Or 'eleven_multilingual_v2' if you prefer
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            });

            if (!elevenLabsResponse.ok) {
                const errorText = await elevenLabsResponse.text();
                console.error('ElevenLabs TTS API error:', errorText);
                return res.status(elevenLabsResponse.status).json({ error: `ElevenLabs TTS API error: ${errorText}` });
            }

            // Get the audio data as a Buffer and convert to Base64
            const audioBufferFromElevenLabs = await elevenLabsResponse.buffer();
            const audioBase64 = audioBufferFromElevenLabs.toString('base64');

            // 5. Send back transcribed text, bot response, and base64 audio to the frontend
            res.status(200).json({
                text: transcribedText,
                botResponse: botResponseText,
                audioBase64: audioBase64,
            });

        } catch (error) {
            console.error('Error in chatbot function:', error);
            res.status(500).json({ error: `Internal Server Error: ${error.message}` });
        }
    };
    
