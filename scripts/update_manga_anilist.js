const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchUserMangaList() {
    const query = `
    query ($userName: String) {
        MediaListCollection(userName: $userName, type: MANGA) {
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
        const mangaList = lists.map(list => ({
            name: list.name,
            entries: list.entries.map(entry => ({
                title: entry.media.title.english || entry.media.title.romaji,
                coverImage: entry.media.coverImage.medium,
                averageScore: entry.media.averageScore,
                chapters: entry.media.chapters,
                status: entry.media.status,
                genres: entry.media.genres,
                format: entry.media.format,
                    country: entry.media.countryOfOrigin,
                    personalScore: entry.score,
                    progress: entry.progress
            })).sort((a, b) => b.personalScore - a.personalScore)
        }));

        fs.writeFileSync(path.join(__dirname, '../manga_list.json'), JSON.stringify(mangaList, null, 2));
        console.log('Manga list updated successfully.');
    } catch (error) {
        console.error('Error fetching user manga list:', error);
    }
}

fetchUserMangaList();
