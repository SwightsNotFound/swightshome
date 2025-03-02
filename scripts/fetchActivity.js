const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// Replace this with your AniList username
const username = 'Swight';

const userQuery = `
query ($username: String!) {
  User(name: $username) {
    id
  }
}
`;

const activityQuery = `
query ($userId: Int!, $page: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      currentPage
      lastPage
    }
    activities(userId: $userId) {
      ... on ListActivity {
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
        createdAt
        text
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

const fetchActivities = async (userId) => {
  let currentPage = 1;
  let lastPage = 1;
  const activities = [];

  do {
    try {
      const response = await axios.post('https://graphql.anilist.co', {
        query: activityQuery,
        variables: { userId, page: currentPage },
      });

      const data = response.data.data;
      activities.push(...data.Page.activities);
      currentPage = data.Page.pageInfo.currentPage + 1;
      lastPage = data.Page.pageInfo.lastPage;
    } catch (error) {
      if (error.response) {
        console.error('Error fetching activities:', error.response.data);
      } else {
        console.error('Error fetching activities:', error.message);
      }
      process.exit(1);
    }
  } while (currentPage <= lastPage);

  return activities;
};

const saveActivitiesToFile = (activities) => {
  // Format activities by day in the Central Time Zone
  const activitiesByDay = activities.reduce((acc, activity) => {
    const date = moment.tz(activity.createdAt * 1000, 'America/Chicago').format('YYYY-MM-DD');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(activity);
    return acc;
  }, {});

  const sortedActivitiesByDay = Object.keys(activitiesByDay)
  .sort()
  .reduce((acc, date) => {
    acc[date] = activitiesByDay[date];
    return acc;
  }, {});

  const filePath = path.join(__dirname, 'activityHistory.json');
  fs.writeFileSync(filePath, JSON.stringify(sortedActivitiesByDay, null, 2));

  console.log(`Activity history saved to ${filePath}`);
};

const main = async () => {
  const userId = await fetchUserId();
  const activities = await fetchActivities(userId);
  saveActivitiesToFile(activities);
};

main();
