// This is your Vercel Serverless Function for the chatbot backend.
// It handles:
// 1. Receiving text from the frontend.
// 2. Sending the text to Google Gemini for a conversational response.
// 3. Sending Gemini's text response to ElevenLabs for Text-to-Speech (TTS).
// 4. Returning the text response and a URL to the generated audio to the frontend.

// Import necessary modules
// 'node-fetch' is used for making HTTP requests (e.g., to Google Gemini and ElevenLabs).
// It's a standard module for fetch API in Node.js environments.
import fetch from 'node-fetch';

// 'form-data' is typically used for multipart/form-data requests,
// which was needed for OpenAI Whisper. We'll keep it for now but it might not be strictly
// necessary if ElevenLabs or future services don't require it.
// For this updated version, it's not directly used as STT is client-side.
// import FormData from 'form-data'; // Not strictly needed for this version

// This is the main handler for your Vercel Serverless Function.
// Vercel automatically calls this function when your API endpoint is accessed.
export default async function handler(request, response) {
    // Ensure the request method is POST.
    // Our frontend sends data via POST.
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // Extract the text from the request body.
    // The frontend now sends the transcribed text directly.
    const userText = request.body.text;

    // Basic validation for the user text.
    if (!userText) {
        return response.status(400).json({ error: 'No text provided.' });
    }

    // --- Retrieve API Keys from Environment Variables ---
    // These keys are set in your Vercel project settings for security.
    // DO NOT hardcode your API keys directly in the code!
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

    // Check if the API keys are set.
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set in environment variables.');
        return response.status(500).json({ error: 'Server configuration error: Gemini API key missing.' });
    }
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
        console.error('ElevenLabs API keys (ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID) are not set in environment variables.');
        return response.status(500).json({ error: 'Server configuration error: ElevenLabs API key or Voice ID missing.' });
    }

    let botResponseText = '';
    let audioUrl = '';

    try {
        // --- Step 1: Get Chatbot Response from Google Gemini ---
        // This section sends the user's text to Google Gemini and gets a text response.
        console.log('Sending text to Google Gemini...');
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [{ text: userText }],
                    }],
                }),
            }
        );

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error('Gemini API error:', JSON.stringify(errorData));
            // Return a more generic error to the frontend for security/simplicity
            return response.status(geminiResponse.status).json({ error: `Gemini API error: ${JSON.stringify(errorData)}` });
        }

        const geminiData = await geminiResponse.json();
        // Extract the text content from Gemini's response
        botResponseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response.';
        console.log('Gemini Bot Response:', botResponseText);

        // --- Step 2: Convert Bot Response to Speech using ElevenLabs ---
        // This section sends the chatbot's text response to ElevenLabs to get an audio file.
        console.log('Sending text to ElevenLabs for TTS...');
        const elevenLabsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg', // Request MP3 audio
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: botResponseText,
                    model_id: 'eleven_monolingual_v1', // Or another suitable model like 'eleven_turbo_v2'
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            }
        );

        if (!elevenLabsResponse.ok) {
            const errorText = await elevenLabsResponse.text();
            console.error('ElevenLabs API error:', elevenLabsResponse.status, errorText);
            // Return a more generic error to the frontend
            return response.status(elevenLabsResponse.status).json({ error: `ElevenLabs API error: ${elevenLabsResponse.status} - ${errorText}` });
        }

        // ElevenLabs returns an audio stream. We need to convert it to a Blob and then a Data URL.
        const audioBlob = await elevenLabsResponse.blob();
        audioUrl = URL.createObjectURL(audioBlob); // Create a temporary URL for the audio

        console.log('ElevenLabs audio generated.');

        // --- Step 3: Send Response back to Frontend ---
        // Send both the text response and the audio URL back to the frontend.
        response.status(200).json({
            text: botResponseText,
            audioUrl: audioUrl,
        });

    } catch (error) {
        console.error('Error in chatbot function:', error);
        // Generic error response for any unexpected issues
        response.status(500).json({ error: 'An unexpected error occurred in the chatbot function.' });
    }
}
