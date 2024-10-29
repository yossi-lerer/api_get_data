process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const SpotifyWebApi = require('spotify-web-api-node');
const Airtable = require('airtable');
const { OpenAI } = require('openai');
const { content } = require('googleapis/build/src/apis/content');


// חיבור ל-Airtable
const BASE_ID = 'appvX13fOignsK871';
const ARTISTS_TABLE_NAME = 'Artists';
const SONGS_TABLE_NAME = 'Songs';
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(BASE_ID);

// חיבור ל-Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENTID,
  clientSecret: process.env.SPOTIFY_CLIENTSECRET,
});

// יצירת אובייקט OpenAI עם מפתח ה-API שלך
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
// פונקציה לניתוח כותרת השיר
async function analyzeTitle(title) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: `Analyze the title of the video: ${title}, and you will understand what the style is and who the music is for` }],
      max_tokens: 60
    });

    if (response.choices && response.choices.length > 0) {
      return response.choices[0].message.content.trim();
    } else {
      return 'Unknown';
    }
  } catch (error) {
    console.error('Error analyzing title:', error);
    return 'Unknown';
  }
}

// פונקציה לקבלת נתוני אמן
async function fetchArtistData(artistName, maxSongs, maxArtists) {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);

    const artistSearchResult = await spotifyApi.searchArtists(artistName);
    const artist = artistSearchResult.body.artists.items[0];

    if (!artist) {
      console.log(`Artist '${artistName}' not found.`);
      return;
    }

    const artistData = {
      spotifyId: artist.id,
      name: artist.name,
      popularity: artist.popularity,
      followers: artist.followers ? artist.followers.total : 0,
      genres: artist.genres.join(', '),
    };

    const artistRecord = await base(ARTISTS_TABLE_NAME).create([{
      fields: {
        'Artist Name': artistData.name,
        'Popularity': artistData.popularity,
        'Followers': artistData.followers,
        'Genres': artistData.genres,
      },
    }]);

    const artistRecordId = artistRecord[0].getId();

    const albums = await spotifyApi.getArtistAlbums(artist.id, { limit: 50 });
    let songCount = 0;

    for (let album of albums.body.items) {
      if (songCount >= maxSongs) break;

      const albumTracks = await spotifyApi.getAlbumTracks(album.id, { limit: 50 });
      for (let track of albumTracks.body.items) {
        if (songCount >= maxSongs) break;

        const analysis = await analyzeTitle(track.name);
        console.log(track)

await base(SONGS_TABLE_NAME).create([
  {
    fields: {
      'Track Name': track.name,
      'Album Name': album.name,
      'Release Date': album.release_date,
      'Duration (ms)': track.duration_ms.toString(),
      'Spotify URL': track.external_urls.spotify,
      'Popularity': track.popularity,
      'Artist': [artistRecordId],
      'Title Analysis': analysis,
      'Artists': track.artists.map(artist => artist.name).join(', '), // שמות כל האמנים
      'Available Markets': track.available_markets.join(', '), // שווקים זמינים
      'Disc Number': track.disc_number.toString(), // מספר דיסק
      'Explicit': track.explicit ? 'Yes' : 'No', // האם זה מוגדר כ-explicit
      'Track URI': track.uri, // URI של השיר
      'Track URL': track.external_urls.spotify, // URL ישיר לשיר
      'Track Number': track.track_number.toString(), // מספר השיר באלבום
      'Track ID': track.id // מזהה השיר ב-Spotify
    }
  }
]);

        console.log(`Track Popularity: ${track.popularity ? track.popularity : 'No popularity data available'}`);

        console.log(`Track '${track.name}' with analysis '${analysis}' sent to Airtable.`);
        songCount++;
      }
    }

    const relatedArtists = await spotifyApi.getArtistRelatedArtists(artist.id);
    let artistCount = 0;

    for (let relatedArtist of relatedArtists.body.artists.slice(0, maxArtists)) {
      if (artistCount >= maxArtists) break;
      await fetchArtistDataById(relatedArtist.id, maxSongs);
      artistCount++;
    }

  } catch (error) {
    console.error('Error fetching or sending data:', error);
  }
}

// פונקציה לקבלת נתוני אמן לפי ID
async function fetchArtistDataById(artistId, maxSongs) {
  try {
    const artist = await spotifyApi.getArtist(artistId);

    if (!artist.body) {
      console.log(`Artist with ID '${artistId}' not found.`);
      return;
    }

    const artistData = {
      spotifyId: artist.body.id,
      name: artist.body.name,
      popularity: artist.body.popularity,
      followers: artist.body.followers ? artist.body.followers.total : 0,
      genres: artist.body.genres.join(', '),
    };

    const artistRecord = await base(ARTISTS_TABLE_NAME).create([{
      fields: {
        'Artist Name': artistData.name,
        'Popularity': artistData.popularity,
        'Followers': artistData.followers,
        'Genres': artistData.genres,
      },
    }]);

    const artistRecordId = artistRecord[0].getId();
    const albums = await spotifyApi.getArtistAlbums(artistId, { limit: 50 });
    let songCount = 0;

    for (let album of albums.body.items) {
      if (songCount >= maxSongs) break;

      const albumTracks = await spotifyApi.getAlbumTracks(album.id, { limit: 50 });
      for (let track of albumTracks.body.items) {
        if (songCount >= maxSongs) break;

        const analysis = await analyzeTitle(track.name);

        await base(SONGS_TABLE_NAME).create([
          {
            fields: {
              'Track Name': track.name,
              'Album Name': album.name,
              'Release Date': album.release_date,
              'Duration (ms)': track.duration_ms.toString(),
              'Spotify URL': track.external_urls.spotify,
              'Popularity': track.popularity,
              'Artist': [artistRecordId],
              'Title Analysis': analysis,
              'Artists': track.artists.map(artist => artist.name).join(', '), // שמות כל האמנים
              'Available Markets': track.available_markets.join(', '), // שווקים זמינים
              'Disc Number': track.disc_number.toString(), // מספר דיסק
              'Explicit': track.explicit ? 'Yes' : 'No', // האם זה מוגדר כ-explicit
              'Track URI': track.uri, // URI של השיר
              'Track URL': track.external_urls.spotify, // URL ישיר לשיר
              'Track Number': track.track_number.toString(), // מספר השיר באלבום
              'Track ID': track.id // מזהה השיר ב-Spotify
            }
          }
        ]);

        console.log(`Track '${track.name}' with analysis '${analysis}' sent to Airtable.`);
        songCount++;
      }
    }

  } catch (error) {
    console.error('Error fetching or sending data:', error);
  }
}

// דוגמה להפעלה
const artistName = 'lofi girl'; // שם האמן
const maxSongs = 5; // מספר השירים לחילוץ מכל אמן
const maxArtists = 3; // מספר האמנים הדומים לחילוץ

module.exports = {
  fetchArtistData
}