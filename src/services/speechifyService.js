// services/speechifyService.js
import { supabase } from './supabase';

class SpeechifyService {
    constructor() {
        this.maxConcurrentRequests = 2; // Strict limit to prevent 429 Too Many Requests
        this.requestQueue = [];
        this.activeRequests = 0;
        this.audioCache = new Map(); // Cache for generated audio
    }

    // getAccessToken removed, token is handled by the Edge Function

    async getVoices() {
        const { data, error } = await supabase.functions.invoke('generate-speech', {
            method: 'GET'
        });

        if (error) {
            throw new Error(`Failed to fetch voices: ${error.message}`);
        }

        return data || [];
    }

    escapeXml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    applyCustomReplacements(text, replacements) {
        if (!replacements || Object.keys(replacements).length === 0) {
            return text;
        }

        let processedText = text;
        for (const [original, replacement] of Object.entries(replacements)) {
            if (original && replacement) {
                try {
                    const regex = new RegExp(this.escapeRegExp(original), 'gi');
                    processedText = processedText.replace(regex, `<sub alias="${this.escapeXml(replacement)}">${this.escapeXml(original)}</sub>`);
                } catch (error) {
                    console.warn(`Failed to apply replacement for "${original}":`, error);
                }
            }
        }
        return processedText;
    }

    // FIXED: Process text with automatic pause insertion ONLY after sentences
    addAutomaticPauses(text, pauseOptions, addSilencePadding = false) {
        if (!pauseOptions.enabled && !addSilencePadding) {
            return text;
        }

        let processedText = text;
        
        // Add slight pause at the beginning for smoother start
        if (addSilencePadding) {
            processedText = `<break time="50ms"/>${processedText}`;
        }
        
        // FIXED: Only add pauses after sentence-ending punctuation (. ! ?)
        // Remove comma and semicolon handling
        const sentenceEnders = /([.!?])\s+/g;
        
        if (pauseOptions.enabled) {
            if (pauseOptions.pauseType === 'time') {
                // Use custom time in milliseconds
                const pauseMs = pauseOptions.pauseTime || 750;
                processedText = processedText.replace(sentenceEnders, `$1<break time="${pauseMs}ms"/> `);
            } else {
                // Use strength-based pauses
                const strength = pauseOptions.pauseStrength || 'medium';
                if (strength !== 'none') {
                    processedText = processedText.replace(sentenceEnders, `$1<break strength="${strength}"/> `);
                }
            }
        }

        // Add slight pause at the end for smoother ending
        if (addSilencePadding) {
            processedText = `${processedText}<break time="50ms"/>`;
        }

        return processedText;
    }

    buildSSML(text, options = {}) {
        const {
            prosody = {},
            emphasis = {},
            emotion = {},
            customReplacements = {},
            breaks = {}, // Break/pause options
            addSilencePadding = false,
            silenceDuration = 50
        } = options;

        // Validate input
        if (!text || typeof text !== 'string') {
            throw new Error('Text input is required and must be a string');
        }

        // Apply custom replacements first (but don't escape yet)
        let processedText = this.applyCustomReplacements(text, customReplacements);

        // Apply automatic pauses before escaping (with silence padding if requested)
        processedText = this.addAutomaticPauses(processedText, breaks, addSilencePadding);

        // Now escape the text (but preserve SSML break tags and sub tags)
        processedText = this.escapeXmlWithSSMLTags(processedText);

        // Build prosody attributes with slight volume ramping for smoother transitions
        const prosodyAttrs = [];
        
        // Adjust pitch for smoother sound
        if (prosody.pitch) {
            prosodyAttrs.push(`pitch="${prosody.pitch}"`);
        }
        
        // Adjust rate
        if (prosody.rate) {
            prosodyAttrs.push(`rate="${prosody.rate}"`);
        }
        
        // Slightly reduce volume at edges if using fade transitions
        if (prosody.volume) {
            let volumeValue = prosody.volume;
            
            // If using custom percentage, slightly reduce for smoother blending
            if (addSilencePadding && volumeValue.includes('%')) {
                const numericValue = parseInt(volumeValue);
                if (!isNaN(numericValue)) {
                    // Reduce by 5% for smoother transitions
                    const adjustedValue = Math.max(-50, numericValue - 5);
                    volumeValue = `${adjustedValue >= 0 ? '+' : ''}${adjustedValue}%`;
                }
            }
            
            prosodyAttrs.push(`volume="${volumeValue}"`);
        }

        let ssmlContent = processedText;

        // Apply global emphasis if enabled
        if (emphasis.enabled && emphasis.level) {
            ssmlContent = `<emphasis level="${emphasis.level}">${ssmlContent}</emphasis>`;
        }

        // Apply prosody if any attributes are set
        if (prosodyAttrs.length > 0) {
            ssmlContent = `<prosody ${prosodyAttrs.join(' ')}>${ssmlContent}</prosody>`;
        }

        // Apply emotion if enabled
        if (emotion.enabled && emotion.type) {
            ssmlContent = `<speechify:style emotion="${emotion.type}">${ssmlContent}</speechify:style>`;
        }

        return `<speak>${ssmlContent}</speak>`;
    }

    // Enhanced XML escaping that preserves SSML tags
    escapeXmlWithSSMLTags(text) {
        if (!text) return '';
        
        // Store SSML tags temporarily
        const ssmlTags = [];
        const placeholders = [];
        
        // Find and replace break tags with placeholders
        let placeholderText = text.replace(/<break[^>]*>/g, (match) => {
            const placeholder = `__SSML_BREAK_${ssmlTags.length}__`;
            ssmlTags.push(match);
            placeholders.push(placeholder);
            return placeholder;
        });
        
        // Find and replace sub tags with placeholders
        placeholderText = placeholderText.replace(/<sub[^>]*>.*?<\/sub>/g, (match) => {
            const placeholder = `__SSML_SUB_${ssmlTags.length}__`;
            ssmlTags.push(match);
            placeholders.push(placeholder);
            return placeholder;
        });

        // Escape the text normally
        placeholderText = placeholderText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // Restore the SSML tags
        ssmlTags.forEach((tag, index) => {
            const placeholder = index < placeholders.length && placeholders[index].includes('BREAK') 
                ? `__SSML_BREAK_${index}__` 
                : `__SSML_SUB_${index}__`;
            placeholderText = placeholderText.replace(placeholder, tag);
        });

        return placeholderText;
    }

    getCacheKey(text, voiceId, language, ssmlOptions) {
        const optionsString = JSON.stringify(ssmlOptions);
        return `${voiceId}_${language}_${text.substring(0, 50)}_${optionsString}`.replace(/[^a-zA-Z0-9]/g, '_');
    }

    // Added method to clear cache for specific settings
    clearCacheForSettings(voiceId, language, ssmlOptions) {
        const keysToDelete = [];
        const settingsString = JSON.stringify(ssmlOptions);
        
        for (const key of this.audioCache.keys()) {
            if (key.includes(`${voiceId}_${language}`) || key.includes(settingsString)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => {
            console.log('🗑️ Clearing cached audio:', key);
            this.audioCache.delete(key);
        });
        
        return keysToDelete.length;
    }

    async generateSpeech(text, voiceId, language, ssmlOptions = {}, forceRegenerate = false) {
        const cacheKey = this.getCacheKey(text, voiceId, language, ssmlOptions);
        
        // If force regenerate, remove from cache first
        if (forceRegenerate && this.audioCache.has(cacheKey)) {
            console.log('🔄 Force regenerating, removing from cache:', cacheKey);
            this.audioCache.delete(cacheKey);
        }
        
        // Check cache
        if (this.audioCache.has(cacheKey) && !forceRegenerate) {
            console.log('💾 Using cached audio for:', cacheKey);
            // Return a clone of the cached blob to avoid issues with multiple uses
            const cachedBlob = this.audioCache.get(cacheKey);
            return new Blob([cachedBlob], { type: cachedBlob.type });
        }

        // Proactively skip SSML Emotion and Emphasis tags for non-English languages
        // to avoid unnecessary 400 errors and retry round-trips.
        const isEnglish = ['en-US', 'en-GB'].includes(language);
        const finalSsmlOptions = isEnglish 
            ? ssmlOptions 
            : { ...ssmlOptions, emotion: { enabled: false }, emphasis: { enabled: false } };

        const ssml = this.buildSSML(text, finalSsmlOptions);
        const model = language.startsWith('en') ? 'simba-english' : 'simba-multilingual';

        const requestBody = {
            input: ssml,
            voice_id: voiceId,
            language: language,
            model: model
        };

        console.log('🎵 Generating fresh speech with SSML:', ssml);

        let data;
        try {
            data = await this.throttleRequest(async () => {
                const { data: responseData, error } = await supabase.functions.invoke('generate-speech', {
                    body: requestBody
                });

                if (error) {
                    throw new Error(`500|${error.message}`);
                }
                return responseData;
            });
        } catch (error) {
            const [status, message] = error.message.split('|');
            
            // 5xx ERROR HANDLING: simba-multilingual is experimental
            if (status.startsWith('5') && model === 'simba-multilingual') {
                throw new Error(`The simba-multilingual model (experimental) is currently unavailable on the server. Please try again later! (Error: ${status})`);
            }
            
            // FALLBACK LOGIC: If 400 Bad Request, it might be an SSML failure (Emotion/Emphasis not supported by model).
            if (status === '400' && (finalSsmlOptions.emotion?.enabled || finalSsmlOptions.emphasis?.enabled)) {
                console.warn('⚠️ SSML 400 Error detected! Falling back to plain text without Emotion/Emphasis tags.');
                
                // Dispatch custom event to notify UI via toast
                window.dispatchEvent(new CustomEvent('speechify-fallback-warning', {
                    detail: { message: 'SSML formatting not supported by this voice. Falling back to default style.' }
                }));

                // Create fallback options without problematic tags
                const fallbackOptions = { ...finalSsmlOptions, emotion: { enabled: false }, emphasis: { enabled: false } };
                const fallbackSsml = this.buildSSML(text, fallbackOptions);
                
                const fallbackBody = { ...requestBody, input: fallbackSsml };

                data = await this.throttleRequest(async () => {
                    const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('generate-speech', {
                        body: fallbackBody
                    });

                    if (fallbackError) {
                        throw new Error(`Fallback generation failed: 500 ${fallbackError.message}`);
                    }
                    return fallbackData;
                });
            } else {
                throw new Error(`Speech generation failed: ${status} ${message}`);
            }
        }

        const audioData = data.audio_data || data.audioContent || data.audio;

        if (!audioData) {
            throw new Error('API returned no audio data');
        }

        const audioFormat = data.audio_format || 'mpeg';
        const audioBlob = this.base64ToBlob(audioData, `audio/${audioFormat}`);

        // Cache the result
        this.audioCache.set(cacheKey, audioBlob);
        console.log('💾 Cached new audio:', cacheKey);

        // Limit cache size (keep last 50 items)
        if (this.audioCache.size > 50) {
            const firstKey = this.audioCache.keys().next().value;
            this.audioCache.delete(firstKey);
        }

        // Return a clone of the blob for use
        return new Blob([audioBlob], { type: audioBlob.type });
    }

    base64ToBlob(base64Data, contentType = 'audio/mpeg') {
        try {
            const byteCharacters = atob(base64Data);
            const byteArrays = [];

            for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
                const slice = byteCharacters.slice(offset, offset + 1024);
                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }
                byteArrays.push(new Uint8Array(byteNumbers));
            }

            return new Blob(byteArrays, { type: contentType });
        } catch (error) {
            throw new Error('Failed to decode audio data: ' + error.message);
        }
    }

    // Enhanced concatenation with gap support and crossfade capability
    async concatenateAudioBlobs(audioBlobs, gapDuration = 0) {
        if (!audioBlobs || audioBlobs.length === 0) {
            throw new Error('No audio blobs to concatenate');
        }

        if (audioBlobs.length === 1) {
            return audioBlobs[0];
        }

        try {
            // Always use Web Audio API for safe concatenation to avoid binary header corruption
            return await this.concatenateWithGaps(audioBlobs, gapDuration);
        } catch (error) {
            throw new Error(`Failed to concatenate audio safely: ${error.message}`);
        }
    }

    // New method: Concatenate with gaps using Web Audio API
    async concatenateWithGaps(audioBlobs, gapDuration) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.warn('Web Audio API not available, concatenating without gaps');
            return this.concatenateAudioBlobs(audioBlobs, 0);
        }

        const audioContext = new AudioContext();
        
        try {
            // Decode all audio blobs
            const audioBuffers = await Promise.all(
                audioBlobs.map(async (blob) => {
                    const arrayBuffer = await blob.arrayBuffer();
                    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
                })
            );

            // Calculate total duration including gaps
            const gapSamples = Math.floor((gapDuration / 1000) * audioContext.sampleRate);
            const totalSamples = audioBuffers.reduce((sum, buffer) => {
                return sum + buffer.length + gapSamples;
            }, -gapSamples); // Remove last gap

            // Create offline context for rendering
            const offlineContext = new OfflineAudioContext(
                2, // stereo
                totalSamples,
                audioContext.sampleRate
            );

            // Place each audio buffer with gaps
            let currentTime = 0;
            for (let i = 0; i < audioBuffers.length; i++) {
                const source = offlineContext.createBufferSource();
                source.buffer = audioBuffers[i];
                
                // Apply slight fade in/out for each segment
                const gainNode = offlineContext.createGain();
                const duration = audioBuffers[i].duration;
                
                gainNode.gain.setValueAtTime(0, currentTime);
                gainNode.gain.linearRampToValueAtTime(1, currentTime + 0.01); // 10ms fade in
                gainNode.gain.setValueAtTime(1, currentTime + duration - 0.01);
                gainNode.gain.linearRampToValueAtTime(0, currentTime + duration); // 10ms fade out
                
                source.connect(gainNode);
                gainNode.connect(offlineContext.destination);
                source.start(currentTime);
                
                currentTime += duration + (gapDuration / 1000);
            }

            // Render the audio
            const renderedBuffer = await offlineContext.startRendering();
            
            // Convert to WAV blob (more reliable for concatenation)
            const wavBlob = await this.audioBufferToWave(renderedBuffer);
            
            audioContext.close();
            
            return wavBlob;
        } catch (error) {
            audioContext.close();
            console.error('Error concatenating with gaps:', error);
            // Fallback to simple concatenation
            return this.concatenateAudioBlobs(audioBlobs, 0);
        }
    }

    // Convert AudioBuffer to WAV format
    async audioBufferToWave(audioBuffer) {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length * numberOfChannels * 2;
        const buffer = new ArrayBuffer(44 + length);
        const view = new DataView(buffer);

        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // PCM chunk size
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, audioBuffer.sampleRate, true);
        view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
        view.setUint16(32, numberOfChannels * 2, true);
        view.setUint16(34, 16, true); // bits per sample
        writeString(36, 'data');
        view.setUint32(40, length, true);

        // Write PCM samples
        let offset = 44;
        for (let i = 0; i < audioBuffer.length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
                view.setInt16(offset, sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    async throttleRequest(requestFn) {
        return new Promise((resolve, reject) => {
            const executeRequest = async () => {
                this.activeRequests++;
                try {
                    const result = await requestFn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    this.activeRequests--;
                    this.processQueue();
                }
            };

            if (this.activeRequests < this.maxConcurrentRequests) {
                executeRequest();
            } else {
                this.requestQueue.push(executeRequest);
            }
        });
    }

    processQueue() {
        if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
            const nextRequest = this.requestQueue.shift();
            nextRequest();
        }
    }

    validateSSMLOptions(options) {
        const validPitchValues = ['x-low', 'low', 'medium', 'high', 'x-high'];
        const validRateValues = ['x-slow', 'slow', 'medium', 'fast', 'x-fast'];
        const validVolumeValues = ['silent', 'x-soft', 'soft', 'medium', 'loud', 'x-loud'];
        const validEmphasisValues = ['reduced', 'moderate', 'strong'];
        const validEmotionValues = [
            'angry', 'cheerful', 'sad', 'terrified', 'relaxed', 
            'fearful', 'surprised', 'calm', 'assertive', 'energetic', 
            'warm', 'direct', 'bright'
        ];
        // Valid pause strength values (including 'none' for disabled state)
        const validPauseStrengthValues = ['none', 'x-weak', 'weak', 'medium', 'strong', 'x-strong'];

        const errors = [];

        if (options.prosody) {
            const { pitch, rate, volume } = options.prosody;

            if (pitch && !validPitchValues.includes(pitch) && !pitch.match(/^[+-]?\d+(\.\d+)?%$/)) {
                errors.push(`Invalid pitch value: ${pitch}`);
            }

            if (rate && !validRateValues.includes(rate) && !rate.match(/^[+-]?\d+(\.\d+)?%$/)) {
                errors.push(`Invalid rate value: ${rate}`);
            }

            if (volume && !validVolumeValues.includes(volume) && !volume.match(/^[+-]?\d+(\.\d+)?%$|^[+-]?\d+(\.\d+)?dB$/)) {
                errors.push(`Invalid volume value: ${volume}`);
            }
        }

        if (options.emphasis?.level && !validEmphasisValues.includes(options.emphasis.level)) {
            errors.push(`Invalid emphasis level: ${options.emphasis.level}`);
        }

        if (options.emotion?.type && !validEmotionValues.includes(options.emotion.type)) {
            errors.push(`Invalid emotion type: ${options.emotion.type}`);
        }

        // Validate pause/break options
        if (options.breaks) {
            const { pauseType, pauseStrength, pauseTime } = options.breaks;

            if (pauseType && !['strength', 'time'].includes(pauseType)) {
                errors.push(`Invalid pause type: ${pauseType}`);
            }

            if (pauseStrength && !validPauseStrengthValues.includes(pauseStrength)) {
                errors.push(`Invalid pause strength: ${pauseStrength}`);
            }

            if (pauseTime !== undefined && (pauseTime < 0 || pauseTime > 10000)) {
                errors.push(`Invalid pause time: ${pauseTime}ms (must be between 0-10000)`);
            }
        }

        return errors;
    }

    clearCache() {
        console.log('🗑️ Clearing entire audio cache');
        this.audioCache.clear();
    }

    clearQueue() {
        this.requestQueue = [];
        this.activeRequests = 0;
    }

    cleanup() {
        this.clearQueue();
        this.clearCache();
    }

    getStatus() {
        return {
            hasToken: true, // Edge function handles auth
            tokenExpiry: null,
            activeRequests: this.activeRequests,
            queuedRequests: this.requestQueue.length,
            cacheSize: this.audioCache.size
        };
    }

    estimateProcessingTime(textLength) {
        return Math.ceil(textLength / 500) * 2;
    }

    isWithinLimit(text, model = 'simba-english') {
        const limit = 2000;
        return text.length <= limit;
    }

    // Get input limit for model (compatibility method)
    getInputLimit(model = 'simba-english') {
        return 2000; // Conservative limit for both models
    }

    // Long speech generation method (compatibility)
    async generateLongSpeech(text, voiceId, language, progressCallback, ssmlOptions = {}) {
        // For compatibility with the original interface, just call regular generateSpeech
        if (progressCallback) {
            progressCallback(1, 1); // Indicate single chunk
        }
        
        return await this.generateSpeech(text, voiceId, language, ssmlOptions);
    }
}

export default new SpeechifyService();