const express = require('express');
const sss = require('./router/spotify')
const app = express();
const {processMusicData} = require('./router/suno_generator')
require('dotenv').config();

const { fetchArtistData } = require('./router/spotify');
const {generateArtistWithAlbums} = require('./router/generate_title');  // Change this line

// אפשרות 1: פונקציה מיידית אסינכרונית
// (async () => {
//     try {
//         const result = await processMusicData('Chill');
//         console.log('Process completed:', result);
//     } catch (error) {
//         console.error('Error:', error);
//     }
// })();

// או אפשרות 2: פונקציה רגילה
async function main() {
    try {
        const result = await processMusicData('Snowmans Skyward Soiree');
        console.log('Process completed:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();

// // Add async function call
// async function init() {
//     try {
//         const result = await generateArtistWithAlbums('1', 'lofi'); // Change this line
//         console.log('Generated titles:', result);
//     } catch (error) {
//         console.error('Error generating titles:', error.message);
//     }
// }

// init(); // Call the function

// Updated API endpoint for generating titles
app.post('/api/generate-titles', async (req, res) => {
    try {
        const { theme, number, musicStyle = 'lofi' } = req.body;
        
        // Validate required parameters
        if (!theme || !number) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required parameters',
                requiredParams: {
                    theme: 'string - required',
                    number: 'number - required',
                    musicStyle: 'string - optional (defaults to "lofi")'
                }
            });
        }

        // Validate parameter types
        if (typeof theme !== 'string' || typeof number !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Invalid parameter types',
                received: {
                    theme: typeof theme,
                    number: typeof number,
                    musicStyle: typeof musicStyle
                }
            });
        }

        const result = await generateTitles(theme, number, musicStyle);
        
        res.json({
            success: true,
            data: {
                artist: {
                    name: result.artistName,
                    theme: result.theme,
                    style: result.musicStyle
                },
                albums: result.albums.map(album => ({
                    albumNumber: album.albumNumber,
                    title: album.albumTitle,
                    theme: album.albumTheme,
                    songs: album.songs.map(song => ({
                        trackNumber: song.trackNumber,
                        title: song.title,
                        musicGenerationPrompt: song.musicPrompt
                    })),
                    recordIds: album.recordIds
                }))
            }
        });
        
    } catch (error) {
        console.error('Error in generate-titles:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error generating titles',
            message: error.message 
        });
    }
});

// Add new endpoint for fetching album data
app.get('/api/album/:albumName', async (req, res) => {
    try {
        const { albumName } = req.params;
        const result = await processMusicData(albumName);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching album data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// הגדרת פורמט של body
app.use(express.json());

// מסלול לטיפול ב-root (הכתובת הראשית)
app.post('/fetchArtistData', async (req, res) => {
    const { artistName, maxSongs, maxArtists } = req.body;

    // בדיקת כל השדות הנדרשים
    if (!artistName || maxSongs === undefined || maxArtists === undefined) {
        return res.status(400).json({ error: 'Missing required fields: artistName, maxSongs, and maxArtists are all required.' });
    }

    try {
        const result = await fetchArtistData(artistName, maxSongs, maxArtists);
        res.status(200).json({ message: 'Artist data fetched successfully', data: result });
    } catch (error) {
        console.error('Error fetching artist data:', error);
        res.status(500).json({ error: 'An error occurred while fetching artist data.' });
    }
});

app.get('/', async (req, res) => {
    res.send('hello')
})


// קבלת בקשה עם URL ייחודי המכיל את הטוקן
app.post('/youtubeapi', (req, res) => {
    const tokenFromQuery = req.query.token;

    // בדיקת טוקן
    if (tokenFromQuery === 'your-unique-token') {
        // פעולה על פי הנתונים
        const data = req.body;
        console.log('Data received:', data);

        // שליחת תגובה ללקוח
        res.status(200).send({
            "track_name": "Lofi",
            "track_id": "6sAn8zDfv8nIq3gdce7QNI",
            "popularity": 46,
            "duration_ms": 122434,
            "track_number": 3,
            "release_date": "2020-02-28",
            "artists": "Domknowz",
            "album": "Its a Lofi",
            "spotify_url": "undefined",
            "image_url": "https://i.scdn.co/image/ab67616d0000b2730ec7420efd171922f5c176ac"
          });
    } else {
        res.status(403).send({ message: 'Unauthorized' });
    }
});


// הפעלת השרת
app.listen(7000, process.env.HOST, () => {
    console.log(`Server is running on http://${process.env.HOST}:7000`);
  });