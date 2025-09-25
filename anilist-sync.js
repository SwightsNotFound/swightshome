const axios = require('axios');
const fs = require('fs');
const path = require('path');

const JSON_DIR = path.join(__dirname, 'json');
const ACTIVITY_FILE = path.join(JSON_DIR, 'activityHistory.json');

// Ensure JSON directory exists
if (!fs.existsSync(JSON_DIR)) {
    fs.mkdirSync(JSON_DIR, { recursive: true });
}

const USERNAME = 'Swight';
const USER_ID = 6405416;

// Configure axios with retry logic
const apiClient = axios.create({
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// Add retry interceptor for rate limiting
apiClient.interceptors.response.use(null, async (error) => {
    const config = error.config;

    if (error.response && error.response.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 5;
        console.log(`Rate limited. Waiting ${retryAfter} seconds before retrying...`);

        await delay(retryAfter * 1000);
        return apiClient(config);
    }

    return Promise.reject(error);
});

// Helper function for delays
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load existing activities
function loadExistingActivities() {
    try {
        if (fs.existsSync(ACTIVITY_FILE)) {
            const data = fs.readFileSync(ACTIVITY_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('No existing activity file or error reading it, starting fresh');
    }
    return {};
}

// Get latest activity date from existing data
function getLatestActivityDate(existingActivities) {
    const dates = Object.keys(existingActivities).filter(date =>
    existingActivities[date] && existingActivities[date].length > 0
    );
    if (dates.length === 0) return null;

    return dates.sort().pop(); // Get the most recent date
}

// Function to fetch only new activities
async function fetchNewActivities(existingActivities) {
    const latestDate = getLatestActivityDate(existingActivities);
    console.log(`Latest activity date in existing data: ${latestDate}`);

    const activityQuery = `
    query ($userId: Int!, $page: Int!, $createdAt_greater: Int) {
        Page(page: $page, perPage: 50) {
            pageInfo {
                currentPage
                lastPage
                hasNextPage
            }
            activities(userId: $userId, sort: ID_DESC, createdAt_greater: $createdAt_greater) {
                ... on ListActivity {
                    id
                    status
                    progress
                    createdAt
                    media {
                        title {
                            english
                            romaji
                        }
                        coverImage {
                            large
                        }
                        siteUrl
                    }
                }
                ... on TextActivity {
                    id
                    createdAt
                    text
                }
            }
        }
    }
    `;

    let currentPage = 1;
    let lastPage = 1;
    let hasNextPage = true;
    const newActivities = [];

    // Convert latest date to timestamp if it exists
    const createdAtGreater = latestDate ?
    Math.floor(new Date(latestDate).getTime() / 1000) :
    undefined;

    console.log(`Fetching activities since ${latestDate || 'beginning'}...`);

    while (hasNextPage && currentPage <= lastPage) {
        try {
            console.log(`Fetching activities page ${currentPage}/${lastPage}`);
            const variables = {
                userId: USER_ID,
                page: currentPage,
                createdAt_greater: createdAtGreater
            };

            const response = await apiClient.post('https://graphql.anilist.co', {
                query: activityQuery,
                variables
            });

            const data = response.data.data;
            const activities = data.Page.activities;

            newActivities.push(...activities);

            const pageInfo = data.Page.pageInfo;
            currentPage = pageInfo.currentPage + 1;
            lastPage = pageInfo.lastPage;
            hasNextPage = pageInfo.hasNextPage;

            if (currentPage <= lastPage) {
                await delay(500);
            }
        } catch (error) {
            console.error('Error fetching activities:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    console.log(`Fetched ${newActivities.length} new activities`);
    return newActivities;
}

// Merge new activities with existing ones
function mergeActivities(existingActivities, newActivities) {
    const merged = { ...existingActivities };

    for (const activity of newActivities) {
        if (!activity.createdAt) continue;

        const date = new Date(activity.createdAt * 1000).toISOString().split('T')[0];
        const activityId = activity.id;

        if (!merged[date]) {
            merged[date] = [];
        }

        // Check if activity already exists to avoid duplicates
        const exists = merged[date].some(existingActivity =>
        existingActivity.id === activityId
        );

        if (!exists) {
            merged[date].push(activity);
        }
    }

    // Sort activities within each date (newest first)
    for (const date in merged) {
        merged[date].sort((a, b) => b.createdAt - a.createdAt);
    }

    return merged;
}

// Function to fetch AniList stats
async function fetchAnilistStats() {
    const query = `
    query ($userId: Int) {
        User(id: $userId) {
            statistics {
                anime {
                    count
                    meanScore
                    minutesWatched
                    episodesWatched
                }
                manga {
                    count
                    meanScore
                    chaptersRead
                    volumesRead
                }
            }
        }
    }
    `;

    const variables = { userId: USER_ID };

    try {
        const response = await apiClient.post('https://graphql.anilist.co', { query, variables });
        return response.data;
    } catch (error) {
        console.error('Error fetching AniList stats:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Function to fetch AniList favorites
async function fetchFavorites() {
    const favoritesQuery = `
    query ($userId: Int!) {
        User(id: $userId) {
            favourites {
                anime {
                    nodes {
                        id
                        title {
                            romaji
                            english
                        }
                        coverImage {
                            large
                        }
                        siteUrl
                    }
                }
                manga {
                    nodes {
                        id
                        title {
                            romaji
                            english
                        }
                        coverImage {
                            large
                        }
                        siteUrl
                    }
                }
                characters {
                    nodes {
                        id
                        name {
                            full
                            native
                        }
                        image {
                            large
                        }
                        siteUrl
                    }
                }
                staff {
                    nodes {
                        id
                        name {
                            full
                            native
                        }
                        image {
                            large
                        }
                        siteUrl
                    }
                }
            }
        }
    }
    `;

    try {
        const response = await apiClient.post('https://graphql.anilist.co', {
            query: favoritesQuery,
            variables: { userId: USER_ID },
        });
        return response.data.data.User.favourites;
    } catch (error) {
        console.error('Error fetching favorites:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Function to fetch AniList genre overview
async function fetchGenreOverview() {
    const genreOverviewQuery = `
    query ($userId: Int!) {
        User(id: $userId) {
            statistics {
                anime {
                    genres {
                        genre
                        count
                        meanScore
                        minutesWatched
                    }
                }
                manga {
                    genres {
                        genre
                        count
                        meanScore
                        chaptersRead
                    }
                }
            }
        }
    }
    `;

    try {
        const response = await apiClient.post('https://graphql.anilist.co', {
            query: genreOverviewQuery,
            variables: { userId: USER_ID },
        });
        return response.data.data.User.statistics;
    } catch (error) {
        console.error('Error fetching genre overview:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Function to fetch AniList anime list
async function fetchUserAnimeList() {
    const query = `
    query ($userName: String) {
        MediaListCollection(userName: $userName, type: ANIME) {
            lists {
                name
                entries {
                    media {
                        id
                        title {
                            english
                            romaji
                        }
                        coverImage {
                            medium
                        }
                        averageScore
                        episodes
                        status
                        genres
                        format
                            countryOfOrigin
                    }
                    score
                    progress
                }
            }
        }
    }
    `;

    const variables = { userName: USERNAME };

    try {
        const response = await apiClient.post('https://graphql.anilist.co', { query, variables });
        const lists = response.data.data.MediaListCollection.lists;
        return lists.map(list => ({
            name: list.name,
            entries: list.entries.map(entry => ({
                id: entry.media.id,
                title: entry.media.title.english || entry.media.title.romaji,
                coverImage: entry.media.coverImage.medium,
                averageScore: entry.media.averageScore,
                episodes: entry.media.episodes,
                status: entry.media.status,
                genres: entry.media.genres,
                format: entry.media.format,
                    country: entry.media.countryOfOrigin,
                    personalScore: entry.score,
                    progress: entry.progress,
                    links: {
                        anilist: `https://anilist.co/anime/${entry.media.id}/`,
                        mal: `https://myanimelist.net/anime/${entry.media.id}`,
                        kitsu: `https://kitsu.io/anime/${entry.media.id}`
                    }
            })).sort((a, b) => (b.personalScore || 0) - (a.personalScore || 0))
        }));
    } catch (error) {
        console.error('Error fetching user anime list:', error);
        throw error;
    }
}

// Function to fetch AniList manga list
async function fetchUserMangaList() {
    const query = `
    query ($userName: String) {
        MediaListCollection(userName: $userName, type: MANGA) {
            lists {
                name
                entries {
                    media {
                        id
                        title {
                            english
                            romaji
                        }
                        coverImage {
                            medium
                        }
                        averageScore
                        chapters
                        status
                        genres
                        format
                            countryOfOrigin
                    }
                    score
                    progress
                }
            }
        }
    }
    `;

    const variables = { userName: USERNAME };

    try {
        const response = await apiClient.post('https://graphql.anilist.co', { query, variables });
        const lists = response.data.data.MediaListCollection.lists;
        return lists.map(list => ({
            name: list.name,
            entries: list.entries.map(entry => ({
                id: entry.media.id,
                title: entry.media.title.english || entry.media.title.romaji,
                coverImage: entry.media.coverImage.medium,
                averageScore: entry.media.averageScore,
                chapters: entry.media.chapters,
                status: entry.media.status,
                genres: entry.media.genres,
                format: entry.media.format,
                    country: entry.media.countryOfOrigin,
                    personalScore: entry.score,
                    progress: entry.progress,
                    links: {
                        anilist: `https://anilist.co/manga/${entry.media.id}/`,
                        mal: `https://myanimelist.net/manga/${entry.media.id}`,
                        kitsu: `https://kitsu.io/manga/${entry.media.id}`
                    }
            })).sort((a, b) => (b.personalScore || 0) - (a.personalScore || 0))
        }));
    } catch (error) {
        console.error('Error fetching user manga list:', error);
        throw error;
    }
}

// Function to save data to JSON file
function saveToFile(filename, data) {
    const filePath = path.join(JSON_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${filePath}`);
}

// Main sync function
async function syncAllData() {
    try {
        console.log('\nStarting data sync at', new Date().toISOString());

        // Load existing activities first
        const existingActivities = loadExistingActivities();

        // Fetch only new activities
        console.log('Fetching new activities...');
        const newActivities = await fetchNewActivities(existingActivities);

        if (newActivities.length > 0) {
            // Merge with existing activities
            const mergedActivities = mergeActivities(existingActivities, newActivities);
            saveToFile('activityHistory.json', mergedActivities);
            console.log(`Activities updated with ${newActivities.length} new entries`);
        } else {
            console.log('No new activities found');
            saveToFile('activityHistory.json', existingActivities); // Keep existing
        }

        await delay(1000);

        // Fetch other data (these don't change as frequently)
        console.log('Fetching AniList stats...');
        const stats = await fetchAnilistStats();
        saveToFile('stats.json', stats);
        await delay(1000);

        console.log('Fetching favorites...');
        const favorites = await fetchFavorites();
        saveToFile('favorites.json', favorites);
        await delay(1000);

        console.log('Fetching genre overview...');
        const genreOverview = await fetchGenreOverview();
        saveToFile('genreOverview.json', genreOverview);
        await delay(1000);

        console.log('Fetching anime list...');
        const animeList = await fetchUserAnimeList();
        saveToFile('anime_list.json', animeList);
        await delay(1000);

        console.log('Fetching manga list...');
        const mangaList = await fetchUserMangaList();
        saveToFile('manga_list.json', mangaList);

        console.log('Data sync completed at', new Date().toISOString());
    } catch (error) {
        console.error('Error in syncAllData:', error);
        throw error;
    }
}

// Run immediately if called directly
if (require.main === module) {
    syncAllData().catch(error => {
        console.error('Sync failed:', error);
        process.exit(1);
    });
}

module.exports = { syncAllData };
