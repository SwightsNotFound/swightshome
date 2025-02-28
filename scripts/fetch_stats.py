import requests
import json

def fetch_anilist_stats(user_id):
    query = '''
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
    '''
    variables = {
        'userId': user_id
    }
    url = 'https://graphql.anilist.co'
    response = requests.post(url, json={'query': query, 'variables': variables})
    return response.json()

user_id = 6405416  # Replace with your AniList user ID
stats = fetch_anilist_stats(user_id)
with open('stats.json', 'w') as f:
    json.dump(stats, f, indent=4)
print("Stats fetched and saved to stats.json")