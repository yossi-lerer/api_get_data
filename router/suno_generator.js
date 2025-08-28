const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Airtable = require('airtable');

require('dotenv').config();

// Airtable configuration
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = 'appvX13fOignsK871';
const sourceTableName = 'Generated_Albums';
const base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId);

const DELAY_BETWEEN_REQUESTS = 270000; // 1 minute in milliseconds

// Utility function for delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function processMusicData(albumName) {
    if (!albumName) {
        console.error('Album name is required');
        throw new Error('Album name is required');
    }

    try {
        console.log('Starting process for album:', albumName);
        const records = await fetchDataByAlbum(albumName);
        console.log(`Successfully fetched ${records.length} records`);

        const results = [];
        for (const record of records) {
            console.log('Processing record:', record);
            
            if (!record.prompt) {
                console.error('Missing prompt for record');
                continue;
            }

            console.log('Sending prompt to API:', record.prompt.substring(0, 50) + '...');
            const response = await sendPromptToAPI(record.prompt, albumName);
            results.push({
                recordId: record.id,
                albumName: record.albumName,
                prompt: record.prompt,
                apiResponse: response
            });

            // Add delay before processing next record
            if (records.indexOf(record) < records.length - 1) {
                console.log(`Waiting ${DELAY_BETWEEN_REQUESTS/1000} seconds before processing next record...`);
                await delay(DELAY_BETWEEN_REQUESTS);
            }
        }

        console.log('Successfully processed all records:', results);
        return results;
    } catch (error) {
        console.error('Failed to process music data:', error);
        throw error;
    }
}

async function fetchDataByAlbum(albumName) {
    const records = [];
    try {
        console.log('Fetching data for album:', albumName);
        
        await base(sourceTableName)
            .select({
                fields: ['Album Name', 'Music Generation Prompt'],
                filterByFormula: `{Album Name} = "${albumName}"`,
                view: 'Grid view'
            })
            .eachPage((pageRecords, fetchNextPage) => {
                console.log(`Found ${pageRecords.length} records`);
                records.push(...pageRecords.map(record => ({
                    id: record.id,
                    albumName: record.fields['Album Name'],
                    prompt: record.fields['Music Generation Prompt']
                })));
                fetchNextPage();
            });

        if (records.length === 0) {
            throw new Error(`No records found for album: ${albumName}`);
        }

        console.log('Successfully fetched records:', records);
        return records;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

async function sendPromptToAPI(prompt, albumName) {
    // Validation
    if (!prompt || !albumName) {
        throw new Error('Missing required parameters');
    }

    const apiUrl = 'http://localhost:5000/api/start';
    const payload = {
        number: 1,
        text: prompt,
        folder: prompt,
        album: albumName,
    };
    
    try {
        console.log('\n=== API Request Debug ===');
        console.log('Sending request to:', apiUrl);
        console.log('Payload:', JSON.stringify(payload, null, 2));

        // שליחת הבקשה ל-API
        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 seconds timeout
        });

        console.log('API Response:', JSON.stringify(response.data, null, 2));
        console.log('========================\n');

        return Array.isArray(response.data) ? response.data : [response.data];

    } catch (error) {
        console.error('API Error:', {
            status: error.response?.status,
            message: error.message,
            data: error.response?.data
        });
        throw error;
    }
}

module.exports = { processMusicData };
