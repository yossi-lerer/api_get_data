const Airtable = require('airtable');
const { OpenAI } = require('openai');
// Remove generateMusic import
require('dotenv').config();

// Configure API keys with the correct BASE_ID
const BASE_ID = 'appvX13fOignsK871'; // Use the same BASE_ID as in spotify.js
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(BASE_ID);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Add this cleaning function
function cleanTitle(title) {
    return title
        .replace(/:/g, '') // Remove colons
        .replace(/["']/g, '') // Remove quotes
        .trim();
}

// Add delay function at the top
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Add rate limiting class
class TokenBucket {
    constructor(tokensPerInterval, interval) {
        this.tokens = tokensPerInterval;
        this.tokensPerInterval = tokensPerInterval;
        this.interval = interval;
        this.lastRefill = Date.now();
        this.queue = [];
        this.processing = false;
    }

    async refillTokens() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const refillAmount = (timePassed / this.interval) * this.tokensPerInterval;
        this.tokens = Math.min(this.tokensPerInterval, this.tokens + refillAmount);
        this.lastRefill = now;
    }

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            await this.refillTokens();
            if (this.tokens < 1) {
                await delay(1000);
                continue;
            }

            const { fn, resolve, reject } = this.queue.shift();
            this.tokens--;
            
            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                reject(error);
            }

            await delay(1000); // Minimum delay between requests
        }

        this.processing = false;
    }

    async executeRequest(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.processQueue();
        });
    }
}

// Initialize rate limiter (50 tokens per minute)
const rateLimiter = new TokenBucket(50, 60 * 1000);

// Update the OpenAI request wrapper
async function makeOpenAIRequest(prompt, maxTokens = 50) {
    const fn = async () => {
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
        });
        return response;
    };

    return rateLimiter.executeRequest(fn);
}

async function generateChannelDescription(artistName, musicStyle, theme) {
    const descriptionPrompt = `Create a YouTube channel description for a ${musicStyle} music artist named "${artistName}".
    Theme: "${theme}"
    
    Important rules:
    - Write in a professional, engaging style
    - Include what listeners can expect
    - Mention the style (${musicStyle}) and theme
    - Keep it between 2-3 sentences
    - Make it inviting and memorable
    - Use specific details from the artist's music and themes
    - Ensure the description is complete and not cut off`;

    const response = await makeOpenAIRequest(descriptionPrompt, 100);
    return response.choices[0].message.content.trim();
}

// Add new function for generating theme
async function generateMainTheme(musicData, topKeywords) {
    // Extract themes from keywords and album names
    const possibleThemes = new Set();
    
    // Add themes from keywords
    musicData.forEach(song => {
        if (song.keywords) {
            const keywords = song.keywords.split(',').map(k => k.trim());
            keywords.forEach(keyword => {
                if (keyword.length > 3) {
                    possibleThemes.add(keyword);
                }
            });
        }
        // Add album names as potential themes
        if (song.albumName) {
            possibleThemes.add(song.albumName);
        }
    });

    const themePrompt = `Create a unique main theme for a music collection.
    Use these elements for inspiration: ${Array.from(possibleThemes).slice(0, 5).join(', ')}
    Keywords to consider: ${topKeywords.join(', ')}
    
    REQUIREMENTS:
    - Theme should be 2-4 words
    - Make it emotional and inspiring
    - Avoid generic themes
    - Should work across multiple music styles
    - Must be memorable and unique
    - Reflect the diversity and essence of the music collection`;

    const response = await makeOpenAIRequest(themePrompt);
    return cleanTitle(response.choices[0].message.content.trim());
}

// Modify the main function to use generated theme
async function generateArtistWithAlbums(yourNumber, musicStyle) {
    try {
        // Make sure the table name matches exactly what's in your Airtable
        const records = await airtableBase('Songs')
            .select({
                // filterByFormula: `{number} = '${yourNumber}'`,
                maxRecords: 300,
                view: "Grid view"
            }).all();

        if (!records || records.length === 0) {
            throw new Error('No records found in the Songs table');
        }

        // הדפסת כל הרשומות שנמצאו
        console.log('נמצאו הרשומות הבאות:');
        records.forEach(record => {
            console.log('------------------------');
            console.log('מספר:', record.fields.number);
            // הדפסת כל השדות הקיימים ברשומה
            Object.keys(record.fields).forEach(field => {
                console.log(`${field}: ${record.fields[field]}`);
            });
        });

        // Update field names to match your Airtable structure
        const musicData = records.map(record => ({
            trackName: record.get('Track Name') || '',
            albumName: record.get('Album Name') || '',
            artist: record.get('Artist') || '',
            keywords: record.get('Keywords') || '',
        }));

        const trackNamesLog = musicData.map(song => song.trackName);
        const albumNamesLog = musicData.map(song => song.albumName);
        const artistsLog = musicData.map(song => song.artist);
        const keywordsLog = musicData.map(song => song.keywords);

        // console.log('Track Names:', trackNamesLog);
        // console.log('Album Names:', albumNamesLog);
        // console.log('artist:', artistsLog);
        // console.log('Keywords:', keywordsLog);
        
        // Collect keywords and track names
        const allKeywords = musicData
            .map(song => song.keywords)
            .join(', ')
            .split(',')
            .map(k => k.trim())
            .filter(k => k);

        const trackNames = musicData
            .map(song => song.trackName)
            .filter(name => name); // Remove empty names

        // Get unique artists for analysis
        const uniqueArtists = [...new Set(musicData
            .map(song => song.artist)
            .filter(artist => artist)
        )];

        // Analyze common keywords for style
        const commonKeywords = allKeywords.reduce((acc, keyword) => {
            acc[keyword] = (acc[keyword] || 0) + 1;
            return acc;
        }, {});

        // Sort keywords by frequency
        const topKeywords = Object.entries(commonKeywords)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([keyword]) => keyword);

        // Generate theme automatically
        const theme = await generateMainTheme(musicData, topKeywords);
        console.log('Generated main theme:', theme);

        // 1. Generate Artist Name (using existing artist prompt)
        const artistName = await generateArtistName(uniqueArtists, musicStyle);

        // Generate channel description
        const channelDescription = await generateChannelDescription(artistName, musicStyle, theme);

        // 2. Generate Multiple Albums
        const albums = [];
        for (let i = 0; i < 10; i++) {
            // Pick a different style for each album
            const albumStyle = musicStyle;
            console.log(`Creating album ${i + 1} with style: ${albumStyle}`);

            const albumTheme = await generateAlbumTheme(theme, albumStyle, albumNamesLog);
            const albumTitle = await generateAlbumTitle(albumNamesLog, theme, albumStyle, albumTheme);
            const songs = await generateSongsForAlbum(albumTitle, albumTheme, albumStyle, trackNamesLog);
            
            const albumRecords = await saveAlbumToAirtable(
                songs,
                albumTitle,
                albumTheme,
                artistName,
                theme,
                albumStyle, // Use the specific style for this album
                i + 1
            );

            albums.push({
                albumNumber: i + 1,
                albumTitle,
                albumTheme,
                albumStyle, // Add the style to the response
                songs: songs.map((song) => ({
                    trackNumber: song.trackNumber,
                    title: song.title,
                    musicPrompt: song.musicPrompt
                })),
                recordIds: albumRecords.map(record => record.id)
            });

            // Log progress
            console.log(`Completed album ${i + 1} of 10: ${albumTitle} (${albumStyle})`);
        }

        return {
            artistName,
            theme,
            musicStyle,
            channelDescription, // Add this new field
            albums
        };

    } catch (error) {
        console.error('Error in generateArtistWithAlbums:', error);
        throw error;
    }
}

// Helper functions
async function generateArtistName(uniqueArtists, musicStyle) {
    // Filter out any non-string values and create Set of lowercase names
    const existingArtistNames = new Set(
        uniqueArtists
            .filter(name => typeof name === 'string' && name.trim() !== '')
            .map(name => name.toLowerCase())
    );
    
    const basePrompt = `Create a unique and completely original ${musicStyle} artist name.
    Consider these keywords for inspiration: ${uniqueArtists.filter(name => typeof name === 'string').slice(0, 3).join(', ')}
    
    CRITICAL REQUIREMENTS:
    - Must be TOTALLY UNIQUE and ORIGINAL
    - Keep it simple and memorable (1-3 words)
    - Should fit ${musicStyle} style
    - NO special characters except spaces
    - Create something fresh and new
    - Must be different from any existing artist name
    - Reflect the artist's unique style and themes`;

    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
        const response = await makeOpenAIRequest(basePrompt);
        const generatedName = cleanTitle(response.choices[0].message.content.trim());
        
        // Check if the generated name exists in our database
        if (!existingArtistNames.has(generatedName.toLowerCase())) {
            console.log(`Generated unique artist name: ${generatedName} (attempt ${attempts + 1})`);
            return generatedName;
        }
        
        attempts++;
        console.log(`Name "${generatedName}" already exists, trying again... (attempt ${attempts})`);
    }

    // If we couldn't generate a unique name, add a random suffix
    const finalAttempt = await makeOpenAIRequest(basePrompt);
    const baseName = cleanTitle(finalAttempt.choices[0].message.content.trim());
    const uniqueId = Math.floor(Math.random() * 1000);
    const finalName = `${baseName} ${uniqueId}`;
    
    console.log(`Generated name with unique suffix: ${finalName}`);
    return finalName;
}

async function generateAlbumTheme(mainTheme, musicStyle, albumNames) {
    const themePrompt = `Create a unique theme variation for a ${musicStyle} album based on the main theme "${mainTheme}".
    Use these keywords for inspiration: ${albumNames}
    Important rules:
    - Make it different from the main theme but related
    - Keep it under 10 words
    - Focus on mood and atmosphere
    - Reflect the specific style and essence of the album
    - Ensure the theme is concise and impactful`;

    const response = await makeOpenAIRequest(themePrompt);
    return cleanTitle(response.choices[0].message.content.trim());
}

async function generateAlbumTitle(topKeywords, theme, musicStyle, albumTheme) {
    const albumPrompt = `Create a unique album title for a ${musicStyle} album with theme: "${albumTheme}".
    Use these keywords as inspiration: ${topKeywords}
    Important rules:
    - Keep it VERY short (2-4 words maximum)
    - Make it catchy and memorable
    - Style should fit ${musicStyle} music
    - Reflect the album's unique theme and style
    - Ensure the title is distinct and engaging`;

    const response = await makeOpenAIRequest(albumPrompt);
    return cleanTitle(response.choices[0].message.content.trim());
}

async function generateMusicPrompt(song, albumTheme, musicStyle, topKeywords) {
    const musicPrompt = `Compose a prompt for Suno AI to create a ${musicStyle} track titled "${song.title}".
    Album theme: "${albumTheme}"
    Keywords: ${topKeywords.join(', ')}
    
    Guidelines:
    - Limit the response to 12 words.
    - Reflect the mood, style, and emotional tone of the song.
    - Include specific instruments, tempo, and unique sound characteristics.
    - Draw inspiration from the album theme and title.
    - Ensure the track has a signature, memorable sound
    - Avoid generic descriptions`;

    const response = await makeOpenAIRequest(musicPrompt, 50);
    const prompt = response.choices[0].message.content.trim();
    
    // Ensure response is limited to 12 words
    const words = prompt.split(/\s+/);
    const limitedPrompt = words.slice(0, 12).join(' ');
    
    return cleanTitle(limitedPrompt);
}

async function generateSongsForAlbum(albumTitle, albumTheme, musicStyle, topKeywords) {
    const songPrompt = `Create 10 unique song titles for a ${musicStyle} album named "${albumTitle}" with theme "${albumTheme}".
    Use these keywords for inspiration: ${topKeywords.join(', ')}
    Important rules:
    - Keep titles VERY short (2-4 words)
    - Make them simple and memorable
    - Fit ${musicStyle} music style
    - Each title should be unique
    - Reflect the album's unique theme and style
    - Ensure each title is distinct and engaging`;

    const response = await makeOpenAIRequest(songPrompt, 200);

    const titles = response.choices[0].message.content
        .split('\n')
        .map(title => cleanTitle(title.replace(/^\d+[\.\)\-]\s*/, '')))
        .filter(title => title)
        .slice(0, 10);

    // Generate music prompts for each song
    const songsWithPrompts = await Promise.all(titles.map(async (title, index) => {
        const musicPrompt = await generateMusicPrompt(
            { title, trackNumber: index + 1 },
            albumTheme,
            musicStyle,
            topKeywords
        );
        return {
            title,
            trackNumber: index + 1,
            musicPrompt
        };
    }));

    return songsWithPrompts;
}

async function saveAlbumToAirtable(songs, albumTitle, albumTheme, artistName, theme, musicStyle, albumNumber) {
    try {
        return Promise.all(songs.map(async (song, index) => {
            const record = await airtableBase('Generated_Albums').create({
                'Title': song.title,
                'Track Number': song.trackNumber,
                'Album Number': albumNumber,
                'Album Name': albumTitle,
                'Album Theme': albumTheme,
                'Theme': theme,
                'Artist Name': artistName,
                'Music Style': musicStyle,
                'Music Generation Prompt': song.musicPrompt,
                'Channel Description': index === 0 ? 
                    await generateChannelDescription(artistName, musicStyle, theme) : '',
                'Creation Date': new Date().toISOString()
            });
            
            console.log(`Saved song ${song.title} to Airtable`);
            return record;
        }));
    } catch (error) {
        console.error('Error saving to Airtable:', error);
        throw error;
    }
}

// Export the new main function

module.exports = {
    generateArtistWithAlbums
}