const express = require('express');
const sss = require('./router/spotify')
const app = express();

require('dotenv').config();

const {fetchArtistData} = require('./router/spotify')


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
app.listen(3000, () => {
    console.log('Server running on port 3000');
});
