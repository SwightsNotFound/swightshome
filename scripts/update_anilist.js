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
                        title {
                            english
                            romaji
                        }
                        coverImage {
                            medium
                        }
                        averageScore
                        episodes
                    }
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
                title: entry.media.title.english || entry.media.title.romaji,
                coverImage: entry.media.coverImage.medium,
                averageScore: entry.media.averageScore,
                episodes: entry.media.episodes
            }))
        }));

        fs.writeFileSync(path.join(__dirname, '../anime_list.json'), JSON.stringify(animeList, null, 2));
        console.log('Anime list updated successfully.');
    } catch (error) {
        console.error('Error fetching user anime list:', error);
    }
}

fetchUserAnimeList();
