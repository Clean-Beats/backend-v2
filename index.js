[backend-v2/index.js]
require('dotenv').config();
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('Missing Spotify credentials in .env');
  process.exit(1);
}

const spotifyApi = new SpotifyWebApi({
  clientId: 1be29ce2f35e42d9967de47c96f84827,
  clientSecret: ea3535dc8a754e32994d4e432fc53726,
  redirectUri: 'http://localhost:3001',
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    res.json({
      access_token: data.body.access_token,
      refresh_token: data.body.refresh_token,
    });
  } catch (error) {
    res.status(500).json({ error: 'OAuth callback failed', details: error.message });
  }
});

const analyzeTrackThemes = (trackName) => {
  const nameLower = trackName.toLowerCase();
  if (nameLower.includes('love') || nameLower.includes('happy')) return 'positive';
  if (nameLower.includes('sad') || nameLower.includes('dark')) return 'negative';
  return 'neutral';
};

app.get('/report', async (req, res) => {
  const { accessToken, dateFilter } = req.query;
  if (!accessToken) return res.status(400).json({ error: 'Access token required' });

  spotifyApi.setAccessToken(accessToken);
  try {
    const response = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 50 });
    let tracks = response.body.items.map(item => ({
      name: item.track.name,
      explicit: item.track.explicit,
      playedAt: item.played_at,
      themes: analyzeTrackThemes(item.track.name),
    }));

    const now = new Date();
    if (dateFilter === 'today') {
      tracks = tracks.filter(t => new Date(t.playedAt).toDateString() === now.toDateString());
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.setDate(now.getDate() - 7));
      tracks = tracks.filter(t => new Date(t.playedAt) >= weekAgo);
    }

    res.status(200).json(tracks.slice(0, 10));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch report', details: error.message });
  }
});

app.get('/playlists', async (req, res) => {
  const { accessToken } = req.query;
  if (!accessToken) return res.status(400).json({ error: 'Access token required' });

  spotifyApi.setAccessToken(accessToken);
  try {
    const recent = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 20 });
    const trackIds = recent.body.items.map(item => item.track.id);
    const tracksInfo = await spotifyApi.getTracks(trackIds);
    const artists = tracksInfo.body.tracks.map(track => track.artists[0].id);
    const artistInfo = await spotifyApi.getArtists(artists.slice(0, 10));
    const genres = artistInfo.body.artists.flatMap(artist => artist.genres).slice(0, 2);

    const playlists = await Promise.all(
      genres.map(async genre => {
        const response = await spotifyApi.searchTracks(`genre:${genre} -explicit`, { limit: 5 });
        return {
          name: `PG-13 ${genre.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
          tracks: response.body.tracks.items.map(track => track.name),
        };
      })
    );
    res.status(200).json(playlists);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch playlists', details: error.message });
  }
});

// Simulate lyrics from Spotify (since no direct API exists yet)
app.get('/lyrics', async (req, res) => {
  const { accessToken, track } = req.query;
  spotifyApi.setAccessToken(accessToken);
  try {
    // Search for the track to get its ID
    const searchResponse = await spotifyApi.searchTracks(track, { limit: 1 });
    const trackId = searchResponse.body.tracks.items[0]?.id;
    if (!trackId) throw new Error('Track not found');

    // Placeholder: Simulate lyrics (Spotify doesn't provide them directly)
    const simulatedLyrics = `Lyrics for "${track}" are not directly available via Spotify API.\nThis is a placeholder.\nImagine some lyrics here with words like damn or hell.`;
    const problematic = ['damn', 'hell', 'ass']; // Example problematic words
    res.json({ text: simulatedLyrics, problematic });
  } catch (error) {
    res.status(200).json({ text: 'Lyrics not available from Spotify', problematic: [] });
  }
});

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));