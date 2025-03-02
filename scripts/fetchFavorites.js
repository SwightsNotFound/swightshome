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

const fetchFavorites = async (userId) => {
  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query: favoritesQuery,
      variables: { userId },
    });

    return response.data.data.User.favourites;
  } catch (error) {
    if (error.response) {
      console.error('Error fetching favorites:', error.response.data);
    } else {
      console.error('Error fetching favorites:', error.message);
    }
    process.exit(1);
  }
};

const saveFavoritesToFile = (favorites) => {
  const filePath = path.join(__dirname, '..', 'favorites.json');
  fs.writeFileSync(filePath, JSON.stringify(favorites, null, 2));
  
  console.log(`Favorites saved to ${filePath}`);
};

const main = async () => {
  const userId = await fetchUserId();
  const favorites = await fetchFavorites(userId);
  saveFavoritesToFile(favorites);
};

main();