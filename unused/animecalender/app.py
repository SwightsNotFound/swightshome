from flask import Flask, render_template, request
import requests
import datetime
from flask_caching import Cache

app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

def get_currently_releasing_anime():
    url = "https://graphql.anilist.co"
    query = '''
    query {
      Page(page: 1, perPage: 50) {
        media(status: RELEASING, format: TV, sort: POPULARITY_DESC) {
          title {
            english
            romaji
          }
          coverImage {
            large
          }
          nextAiringEpisode {
            airingAt
            episode
          }
          siteUrl
        }
      }
    }
    '''
    response = requests.post(url, json={'query': query})
    if response.status_code == 200:
        return response.json().get('data', {}).get('Page', {}).get('media', [])
    return []

def get_upcoming_anime(season):
    url = "https://graphql.anilist.co"
    query = '''
    query ($season: MediaSeason, $year: Int) {
      Page(page: 1, perPage: 50) {
        media(season: $season, seasonYear: $year, format: TV, sort: POPULARITY_DESC) {
          title {
            english
            romaji
          }
          coverImage {
            large
          }
          startDate {
            year
            month
            day
          }
          siteUrl
        }
      }
    }
    '''
    current_year = datetime.datetime.now().year
    variables = {
        "season": season,
        "year": current_year
    }
    response = requests.post(url, json={'query': query, 'variables': variables})
    if response.status_code == 200:
        return response.json().get('data', {}).get('Page', {}).get('media', [])
    return []

def format_airing_time(airing_at):
    airing_datetime = datetime.datetime.fromtimestamp(airing_at)
    formatted_date = airing_datetime.strftime('%B %-d')
    formatted_time = airing_datetime.strftime('%I:%M %p')
    return f"{formatted_date} at {formatted_time}"

@app.template_filter('datetimeformat')
def datetimeformat(value, format='%B %-d at %I:%M %p'):
    return datetime.datetime.fromtimestamp(value).strftime(format)

def formatDateTime(value):
    date = datetime.datetime.fromtimestamp(value)
    formattedDateTime = date.strftime('%B %d, %Y %I:%M %p')
    if '12:00 AM' in formattedDateTime:
        return date.strftime('%B %d, %Y')
    return formattedDateTime

def determine_current_season():
    current_month = datetime.datetime.now().month
    if current_month in [1, 2, 3]:
        return 'winter'
    elif current_month in [4, 5, 6]:
        return 'spring'
    elif current_month in [7, 8, 9]:
        return 'summer'
    else:
        return 'fall'

@app.route('/')
@cache.cached(timeout=300)
def index():
    anime_list = get_currently_releasing_anime()
    anime_list = [anime for anime in anime_list if anime['nextAiringEpisode']]
    anime_list.sort(key=lambda x: x['nextAiringEpisode']['airingAt'])
    
    days_of_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    anime_schedule = {day: [] for day in days_of_week}
    
    for anime in anime_list:
        title = anime['title']['english'] or anime['title']['romaji']
        cover_image = anime['coverImage']['large']
        site_url = anime['siteUrl']
        airing_info = anime['nextAiringEpisode']
        
        if airing_info:
            airing_at = airing_info['airingAt']
            episode = airing_info['episode']
            airing_datetime = datetime.datetime.fromtimestamp(airing_at)
            airing_day = airing_datetime.strftime('%A')  # Get the full weekday name
            formatted_airing_at = format_airing_time(airing_at)
            anime_schedule[airing_day].append({
                'title': title,
                'cover_image': cover_image,
                'airing_at': formatted_airing_at,
                'timestamp': airing_at,
                'episode': episode,
                'site_url': site_url
            })
    
    # Sort anime by airing time for each day
    for day in anime_schedule:
        anime_schedule[day].sort(key=lambda x: x['timestamp'])

    # Get the current day of the week
    current_day = datetime.datetime.now().strftime('%A')

    # Determine the current season
    current_season = determine_current_season()
    
    return render_template('index.html', anime_schedule=anime_schedule, current_day=current_day, anime_list=anime_list, current_season=current_season, current_page='airing', formatDateTime=formatDateTime)

@app.route('/season/<season>')
@cache.cached(timeout=300)
def season(season):
    anime_list = get_upcoming_anime(season.upper())
    for anime in anime_list:
        anime['title'] = anime['title']['english'] or anime['title']['romaji']
        anime['cover_image'] = anime['coverImage']['large']
        anime['site_url'] = anime['siteUrl']
        start_date = anime.get('startDate')
        if start_date and start_date['year'] and start_date['month'] and start_date['day']:
            anime['start_date'] = datetime.datetime(start_date['year'], start_date['month'], start_date['day']).timestamp()
        else:
            anime['start_date'] = None

    # Determine the current season
    current_season = determine_current_season()
    
    return render_template('season.html', season=season, anime_list=anime_list, current_season=current_season, current_page='season', formatDateTime=formatDateTime)

if __name__ == "__main__":
    app.run(debug=True)