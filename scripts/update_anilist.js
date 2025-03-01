const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

    const variables = {
        userName: "Swight"
    };

    const url = 'https://graphql.anilist.co';

    try {
        const response = await axios.post(url, {
            query: query,
            variables: variables
        });

        const lists = response.data.data.MediaListCollection.lists;
        const animeList = lists.map(list => ({
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
            })).sort((a, b) => b.personalScore - a.personalScore)
        }));

        fs.writeFileSync(path.join(__dirname, '../anime_list.json'), JSON.stringify(animeList, null, 2));
        console.log('Anime list updated successfully.');
    } catch (error) {
        console.error('Error fetching user anime list:', error);
    }
}

fetchUserAnimeList();