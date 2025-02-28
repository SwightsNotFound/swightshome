const axios = require('axios');
const fs = require('fs');

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
        console.error('Error fetching AniList stats:', error);
        throw error;
    }
}

const userId = 6405416;  // Replace with your AniList user ID

fetchAnilistStats(userId)
.then(stats => {
    fs.writeFileSync('stats.json', JSON.stringify(stats, null, 4));
    console.log("Stats fetched and saved to stats.json");
})
.catch(error => {
    console.error('Error:', error);
});
