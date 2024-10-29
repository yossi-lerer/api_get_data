const { google } = require('googleapis');
const Airtable = require('airtable');
const youtube = google.youtube('v3');
const BASE_ID = 'appvX13fOignsK871'; // החלף ב-ID של ה-Base שלך ב-Airtable
const TABLE_NAME = 'youtube'; // החלף בשם הטבלה שלך ב-Airtable

require('dotenv').config();


// חיבור ל-Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(BASE_ID);

// מערך לשמירת הנתונים של כל הסרטונים
let videoDetailsArray = [];
async function getVideoDetails(videoId, channelName, channelId) {
  try {
    const response = await youtube.videos.list({
      key: process.env.YOUTUBE_API_KEY,
      id: videoId,
      part: 'snippet,contentDetails,statistics,status',
    });

    const video = response.data.items[0];

    // שמירת הנתונים במערך
    videoDetailsArray.push({
      title: video.snippet.title,
      description: video.snippet.description,
      publishedAt: video.snippet.publishedAt,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      commentCount: video.statistics.commentCount,
      duration: video.contentDetails.duration,
      privacyStatus: video.status.privacyStatus,
      videoId: videoId,
      channelName: channelName,  // הוספת שם הערוץ
      channelId: channelId
    });
  } catch (error) {
    console.error('Error fetching video details:', error);
  }
}

async function getChannelVideos(channelId) {
  try {
    // קבלת פרטים על הערוץ
    const channelDetails = await youtube.channels.list({
      key: API_KEY,
      id: channelId,
      part: 'snippet',
    });
    
    const channelName = channelDetails.data.items[0].snippet.title; // שם הערוץ

    const response = await youtube.search.list({
      key: API_KEY,
      channelId: channelId,
      part: 'snippet',
      order: 'date',
      publishedAfter: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString(),
      maxResults: 50,
    });

    const videos = response.data.items;

    for (let video of videos) {
      const videoId = video.id.videoId;
      if (videoId) {
        await getVideoDetails(videoId, channelName, channelId); // שליחת שם הערוץ לפונקציה
      }
    }

    // הדפסת המערך
    console.log('Video Details Array:', videoDetailsArray);

    // שליחת הנתונים ל-Airtable
    await sendArrayToAirtable(videoDetailsArray);

    // ריקון המערך לאחר השליחה
    videoDetailsArray.length = 0;

  } catch (error) {
    console.error('Error fetching channel videos:', error);
  }
}

async function sendArrayToAirtable(dataArray) {
  for (let video of dataArray) {
    try {
      await base(TABLE_NAME).create([
        {
          fields: {
            Title: video.title,
            Description: video.description,
            PublishedAt: video.publishedAt,
            ViewCount: video.viewCount,
            LikeCount: video.likeCount,
            CommentCount: video.commentCount,
            Duration: video.duration,
            PrivacyStatus: video.privacyStatus,
            VideoId: video.videoId,
            ChannelName: video.channelName,  // שליחת שם הערוץ ל-Airtable
            ChannelId: video.channelId
          }
        }
      ]);
      console.log(`Video '${video.title}' sent to Airtable.`);
    } catch (error) {
      console.error('Error sending data to Airtable:', error);
    }
  }
}

// החלף בערוץ ה-YouTube אותו תרצה לגרד
const channelId = 'UCX6OQ3DkcsbYNE6H8uQQuVA';
getChannelVideos(channelId);
