const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');

class TTS {
    constructor() {
        // Initialize Google Cloud TTS client with credentials
        this.client = new textToSpeech.TextToSpeechClient({
            keyFilename: path.join(__dirname, 'google-cloud-key.json')
        });
    }

    /**
     * Convert text to speech and return as base64 string
     * @param {string} text - The text to convert to speech
     * @returns {Promise<string>} - Base64 encoded audio data
     */
    async synthesizeSpeechToBase64(text) {
        try {
            const request = {
                input: { text: text },
                voice: {
                    languageCode: 'ko-KR',
                    name: 'ko-KR-Chirp3-HD-Aoede',
                    ssmlGender: 'FEMALE'
                },
                audioConfig: {
                    audioEncoding: 'MP3',
                    speakingRate: 1.0,
                    pitch: 0.0,
                    volumeGainDb: 0.0
                }
            };

            const [response] = await this.client.synthesizeSpeech(request);
            return response.audioContent.toString('base64');

        } catch (error) {
            console.error('Error synthesizing speech to base64:', error);
            throw error;
        }
    }

    /**
     * Get available voices for Korean
     * @returns {Promise<Array>} - List of available Korean voices
     */
    async getAvailableVoices() {
        try {
            const [response] = await this.client.listVoices({
                languageCode: 'ko-KR'
            });

            return response.voices.map(voice => ({
                name: voice.name,
                languageCodes: voice.languageCodes,
                ssmlGender: voice.ssmlGender,
                naturalSampleRateHertz: voice.naturalSampleRateHertz
            }));

        } catch (error) {
            console.error('Error getting available voices:', error);
            throw error;
        }
    }
}

module.exports = TTS;