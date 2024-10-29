const SpotifyWebApi = require('spotify-web-api-node');
const Airtable = require('airtable');
require('dotenv').config();

// חיבור ל-Airtable
const BASE_ID = 'appvX13fOignsK871';
const TABLE_NAME = 'playlist';
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(BASE_ID);

// חיבור ל-Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.clientId,
  clientSecret: process.env.clientSecret,
});


async function fetchPlaylistTracks(playlistId) {
    try {
      // השגת טוקן גישה ל-Spotify
      const data = await spotifyApi.clientCredentialsGrant();
      spotifyApi.setAccessToken(data.body['access_token']);
  
      // קבלת מידע על הפלייליסט, כולל שם הפלייליסט
      const playlistData = await spotifyApi.getPlaylist(playlistId);
      const playlistName = playlistData.body.name; // שם הפלייליסט
  
      // קבלת רשימת השירים בפלייליסט
      const playlistTracks = await spotifyApi.getPlaylistTracks(playlistId, {
        limit: 100,
      });
  
      // עיבוד כל השירים בפלייליסט
      for (let trackItem of playlistTracks.body.items) {
        const track = trackItem.track;
  
        await base(TABLE_NAME).create([
          {
            fields: {
              'Playlist Name': playlistName.toString(),       // שם הפלייליסט
              'Track Name': track.name.toString(),            // שם השיר
              'Artist Name': track.artists[0].name.toString(), // שם האמן הראשון
              'Album Name': track.album.name.toString(),      // שם האלבום
              'Release Date': track.album.release_date.toString(), // תאריך יציאה
              'Duration (ms)': track.duration_ms.toString(),  // משך הזמן במילישניות
              'Spotify URL': track.external_urls.spotify.toString(), // כתובת ה-URL של השיר ב-Spotify
              'Popularity': track.popularity.toString()       // פופולריות השיר
            },
          },
        ]);
  
        console.log(`Track '${track.name}' by '${track.artists[0].name}' from playlist '${playlistName}' sent to Airtable.`);
      }
    } catch (error) {
      console.error('Error fetching or sending data:', error);
    }
  }
  

// קריאת הפונקציה עם ה-ID של הפלייליסט
const playlistId = '37i9dQZF1DWSYF6geMtQMW';  // החלף ב-ID של הפלייליסט שתרצה לגרד
fetchPlaylistTracks(playlistId);
