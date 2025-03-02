const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Replace this with your AniList username
const username = 'Swight';

const userQuery = `
query ($username: String!) {
  User(name: $username) {
    id
  }
}
`;

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

const fetchUserId = async () => {
  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query: userQuery,
      variables: { username },
    });

    return response.data.data.User.id;
  } catch (error) {
    if (error.response) {
      console.error('Error fetching user ID:', error.response.data);
    } else {
      console.error('Error fetching user ID:', error.message);
    }
    process.exit(1);
  }
};

const fetchGenreOverview = async (userId) => {
  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query: genreOverviewQuery,
      variables: { userId },
    });

    return response.data.data.User.statistics;
  } catch (error) {
    if (error.response) {
      console.error('Error fetching genre overview:', error.response.data);
    } else {
      console.error('Error fetching genre overview:', error.message);
    }
    process.exit(1);
  }
};

const saveGenreOverviewToFile = (genreOverview) => {
  const filePath = path.join(__dirname, '..', 'genreOverview.json');
  fs.writeFileSync(filePath, JSON.stringify(genreOverview, null, 2));
  
  console.log(`Genre overview saved to ${filePath}`);
};

const main = async () => {
  const userId = await fetchUserId();
  const genreOverview = await fetchGenreOverview(userId);
  saveGenreOverviewToFile(genreOverview);
};

main();