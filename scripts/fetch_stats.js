const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchAnilistStats(userId) {
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

    const variables = {
        userId: userId
    };

    const url = 'https://graphql.anilist.co';

    try {
        const response = await axios.post(url, {
            query: query,
            variables: variables
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching AniList stats:', error.response ? error.response.data : error.message);
        throw error;
    }
}

const userId = 6405416;  // Replace with your AniList user ID

fetchAnilistStats(userId)
    .then(stats => {
        console.log('Fetched stats:', stats);  // Log the fetched stats
        try {
            const filePath = path.join(process.cwd(), 'stats.json');
            console.log('Writing to file:', filePath);  // Log the file path
            fs.writeFileSync(filePath, JSON.stringify(stats, null, 4));
            console.log("Stats fetched and saved to stats.json");
        } catch (writeError) {
            console.error('Error writing to file:', writeError);
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
